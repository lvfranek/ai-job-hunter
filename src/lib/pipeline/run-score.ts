import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { CHUNK_SIZE, chunk, scoreChunk, getScoringModelName } from "@/lib/agents/agent-3";
import { OpenRouterError } from "@/lib/gemini";
import type { DbJob, Preferences } from "@/lib/types";

// Run this many chunks concurrently. Chunks are small now (6 condensed jobs, a
// few seconds each), so more can be in flight without hammering the provider —
// this is what turns a ~6 minute run into a ~2 minute one.
const CONCURRENCY = 6;

// Hard ceiling on a single chunk, independent of the AI client's own timeout —
// if a chunk somehow neither resolves nor rejects, the run must not hang on it.
// A healthy small chunk answers in seconds; 60s already means something is wrong.
const CHUNK_TIMEOUT_MS = 60_000;

// One retry per chunk soaks up transient provider errors (429s, 5xx, brief
// network blips) so a whole run doesn't finish with holes in it.
const CHUNK_RETRIES = 1;
const RETRY_DELAY_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function scoreChunkResilient(
  jobChunk: DbJob[],
  preferences: Preferences
): Promise<Awaited<ReturnType<typeof scoreChunk>>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= CHUNK_RETRIES; attempt++) {
    try {
      return await withTimeout(
        scoreChunk(jobChunk, preferences),
        CHUNK_TIMEOUT_MS,
        "scoreChunk"
      );
    } catch (error) {
      lastError = error;
      // A bad API key or an unknown model slug fails identically every time —
      // burning a retry (and the whole run) on it just wastes the user's minutes.
      if (error instanceof OpenRouterError && error.isPermanent) throw error;
      if (attempt < CHUNK_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

type JobWithMatchInfo = DbJob & { job_matches: { id: string; stale_at: string | null } | null };

// Jobs that have never been scored AND jobs whose score went stale (preferences
// changed since) — one action, "keep my scores current", shared by /api/score
// (manual button) and /api/cron/scrape (automated run).
export async function getJobsNeedingScoring(
  supabase: ReturnType<typeof getSupabaseServerClient>
): Promise<{ jobs: DbJob[]; preferences: Preferences | null }> {
  const [{ data: preferences }, { data: jobs }] = await Promise.all([
    supabase.from("preferences").select("*").eq("user_id", CURRENT_USER_ID).single(),
    supabase
      .from("jobs")
      .select("*, job_matches(id, stale_at)")
      .eq("user_id", CURRENT_USER_ID)
      .is("deleted_at", null),
  ]);

  const needsScoring = ((jobs ?? []) as JobWithMatchInfo[]).filter(
    (job) => job.job_matches === null || job.job_matches.stale_at !== null
  );

  return { jobs: needsScoring, preferences: (preferences as Preferences) ?? null };
}

export interface ScorePipelineResult {
  scored: number;
  failed: number;
}

// A 'running' score_run whose heartbeat (updated_at) is older than this has lost
// its worker — a crashed/frozen serverless invocation, a killed dev process, a
// hung request that outlived every inner timeout. Flip it to 'failed' so callers
// stop treating it as in-progress. Generous enough to never trip a slow-but-live
// run: worst case a round is ~3 chunks of (120s timeout + retry + 120s) ≈ 4min,
// and the pipeline also heartbeats at the start of every round.
const STALE_RUN_MS = 8 * 60 * 1000;

/**
 * Mark any of this user's score_runs that are stuck in 'running' with a stale
 * heartbeat as 'failed'. Safe to call before starting a new run and on every
 * status poll. Returns the ids it reaped.
 */
export async function failStaleScoreRuns(
  supabase: ReturnType<typeof getSupabaseServerClient>
): Promise<string[]> {
  const cutoff = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const { data, error } = await supabase
    .from("score_runs")
    .update({
      status: "failed",
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      errors: { message: "Run stalled — no progress heartbeat" },
    })
    .eq("user_id", CURRENT_USER_ID)
    .eq("status", "running")
    .lt("updated_at", cutoff)
    .select("id");

  if (error) {
    console.error("failStaleScoreRuns failed:", error);
    return [];
  }
  return (data ?? []).map((r) => r.id as string);
}

export async function runScorePipeline(
  runId: string,
  jobs: DbJob[],
  preferences: Preferences
): Promise<ScorePipelineResult> {
  const supabase = getSupabaseServerClient();
  const chunks = chunk(jobs, CHUNK_SIZE);
  const errors: Record<string, string> = {};
  // `scored` counts jobs that actually got a match row; `failed` counts the rest.
  // They used to be conflated — every chunk added its full length to `scored`
  // even when it errored, so the counter hit 100% while jobs stayed unscored.
  let scored = 0;
  let failed = 0;
  let completedChunks = 0;

  // Heartbeat: any write that means "this run is still alive". /api/score/status
  // and /api/score treat a 'running' row whose updated_at has gone stale as a
  // dead run and fail it, so the UI never polls a zombie forever.
  const heartbeat = async (fields: Record<string, unknown> = {}) => {
    try {
      await supabase
        .from("score_runs")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", runId);
    } catch (error) {
      console.error("score_runs heartbeat failed:", error);
    }
  };

  try {
    await heartbeat({
      total_chunks: chunks.length,
      completed_chunks: 0,
      scored: 0,
      failed: 0,
      model: await getScoringModelName().catch(() => null),
    });

    // Set by a chunk that failed for a reason no other chunk can survive either
    // (bad key, unknown model). Checked between rounds so the run aborts in
    // seconds instead of grinding every chunk against the same wall.
    let fatalError: unknown = null;

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      // Cooperative cancellation: check between rounds rather than mid-flight —
      // chunks already launched still finish, but no new ones start.
      const { data: current } = await supabase
        .from("score_runs")
        .select("status")
        .eq("id", runId)
        .single();
      if (current?.status === "cancelled") {
        await heartbeat({
          scored,
          failed,
          completed_chunks: completedChunks,
          errors: Object.keys(errors).length > 0 ? errors : null,
        });
        return { scored, failed };
      }

      // Mark the run alive at the start of each round too, so a healthy run whose
      // rounds run long never looks stale to the reaper.
      await heartbeat();

      const round = chunks.slice(i, i + CONCURRENCY);
      await Promise.all(
        round.map(async (jobChunk, idx) => {
          try {
            const results = await scoreChunkResilient(jobChunk, preferences);
            if (results.length > 0) {
              const { error } = await supabase
                .from("job_matches")
                .upsert(
                  results.map((r) => ({ ...r, user_id: CURRENT_USER_ID, stale_at: null })),
                  { onConflict: "job_id" }
                );
              if (error) throw error;
            }
            scored += results.length;
            // The model skipped some jobs in this chunk (or the salvage parser
            // could only recover part of the response). They keep no match row,
            // so the next run picks them up again.
            const missing = jobChunk.length - results.length;
            if (missing > 0) {
              failed += missing;
              errors[`chunk_${i + idx}`] = `${missing} of ${jobChunk.length} jobs came back without a score`;
            }
          } catch (error) {
            console.error(`Scoring chunk failed:`, error);
            failed += jobChunk.length;
            errors[`chunk_${i + idx}`] = String(error);
            if (error instanceof OpenRouterError && error.isPermanent) fatalError = error;
          } finally {
            // The bookkeeping write is guarded so a transient DB error here can't
            // reject Promise.all and abort the rounds still to come.
            completedChunks += 1;
            await heartbeat({
              scored,
              failed,
              completed_chunks: completedChunks,
              // Persist errors as they happen, not just at the end — a cancelled
              // run used to discard every diagnostic it had collected.
              errors: Object.keys(errors).length > 0 ? errors : null,
            });
          }
        })
      );

      if (fatalError) throw fatalError;
    }

    await supabase
      .from("score_runs")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        scored,
        failed,
        completed_chunks: completedChunks,
        errors: Object.keys(errors).length > 0 ? errors : null,
      })
      .eq("id", runId);

    return { scored, failed };
  } catch (error) {
    await supabase
      .from("score_runs")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        scored,
        failed,
        completed_chunks: completedChunks,
        errors: { ...errors, message: String(error) },
      })
      .eq("id", runId);
    throw error;
  }
}
