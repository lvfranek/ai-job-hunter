// Scoring evaluation: runs the test postings in eval/cases.ts through the real
// scoring code (same prompt, model, evidence check and rules as the app)
// several times, and reports how often the tier is right and how stable it is.
//
//   npm run eval                       # all cases, 3 runs, writes eval/RESULTS.md
//   npm run eval -- --runs 1           # one run
//   npm run eval -- --only dev-french  # quick check of some cases, writes nothing
//
// Needs OPENROUTER_API_KEY (in .env.local, or stored via the Settings page).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chunk, CHUNK_SIZE, judgeChunk, readChunk } from "@/lib/agents/agent-3";
import { chanceShortLabels, type Chance, type Requirement } from "@/lib/chance";
import data from "@/lib/geo/places-dach.json";
import { buildPlaceIndex, resolveHomes } from "@/lib/geo/places";
import { AI_MODEL, type Usage } from "@/lib/openrouter";
import { normalizeRequirements, readPostingFacts, SCORING_VERSION } from "@/lib/scoring-rules";
import type { ChanceResult } from "@/lib/scoring-rules";
import type { DbJob, Preferences } from "@/lib/types";
import { CANDIDATES, CASES, type CandidateId, type EvalCase } from "./cases";

const EVAL_DIR = path.join(process.cwd(), "eval");

// ---- options ------------------------------------------------------------------

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const RUNS = Number(flag("runs") ?? 3);
const ONLY = flag("only")?.split(",");
const cases = ONLY ? CASES.filter((c) => ONLY.includes(c.id)) : CASES;
// Only a full run is written to disk; a partial one is a quick check.
const SAVE = !ONLY;

// ---- fixtures -----------------------------------------------------------------

// Neutral ids: the model sees the job id, and a case id like
// "dev-werkstudent-in-text" would give the answer away.
const jobId = (i: number) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;

const jobs = new Map<string, DbJob>(
  cases.map((c, i) => [
    c.id,
    {
      id: jobId(i),
      user_id: "eval",
      url: null,
      title: c.posting.title,
      company: c.posting.company,
      description: c.posting.description,
      platform: "eval",
      status: null,
      applied_at: null,
      salary: null,
      posted_date: null,
      location: c.posting.location,
      postal_code: null,
      country_code: null,
      latitude: null,
      longitude: null,
      created_at: "",
    },
  ]),
);

const index = buildPlaceIndex(data);

function candidateSetup(id: CandidateId) {
  const profile = CANDIDATES[id];
  const preferences = {
    ...profile,
    id: "eval",
    user_id: "eval",
    created_at: "",
    updated_at: "",
  } as Preferences;
  const { homes, unresolved } = resolveHomes(index, profile.work_locations);
  if (unresolved.length > 0) throw new Error(`Unknown place in eval profile: ${unresolved}`);
  return { preferences, geo: { index, homes } };
}

// ---- running ------------------------------------------------------------------

interface Outcome {
  caseId: string;
  run: number;
  result: ChanceResult | null;
  entry: Record<string, unknown> | null;
  error?: string;
}

interface ChunkStat {
  ms: number;
  /** One per AI call; more than one means the answer needed a repair. */
  usages: Usage[];
  jobs: number;
}

async function runOnce(run: number, stats: ChunkStat[]): Promise<Outcome[]> {
  const byCandidate = Object.keys(CANDIDATES) as CandidateId[];
  const work = byCandidate.flatMap((candidateId) => {
    const group = cases.filter((c) => c.candidate === candidateId);
    return chunk(group, CHUNK_SIZE).map((part) => ({ candidateId, part }));
  });

  const outcomes = await Promise.all(
    work.map(async ({ candidateId, part }) => {
      const { preferences, geo } = candidateSetup(candidateId);
      const chunkJobs = part.map((c) => jobs.get(c.id)!);
      const usages: Usage[] = [];
      const start = Date.now();
      try {
        const entries = await readChunk(chunkJobs, preferences, { onUsage: (u) => usages.push(u) });
        stats.push({ ms: Date.now() - start, usages, jobs: part.length });
        const results = judgeChunk(entries, chunkJobs, preferences, geo);
        return part.map((c): Outcome => {
          const job = jobs.get(c.id)!;
          return {
            caseId: c.id,
            run,
            result: results.find((r) => r.job_id === job.id) ?? null,
            entry: entries.find((e) => e.job_id === job.id) ?? null,
          };
        });
      } catch (error) {
        stats.push({ ms: Date.now() - start, usages, jobs: part.length });
        return part.map((c): Outcome => ({
          caseId: c.id,
          run,
          result: null,
          entry: null,
          error: String(error),
        }));
      }
    }),
  );
  return outcomes.flat();
}

// ---- grading ------------------------------------------------------------------

const asList = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);
const tier = (c: Chance | null | undefined) => (c ? chanceShortLabels[c] : "–");
const show = (value: unknown) => (value === null ? "null" : String(value));

interface Graded {
  outcome: Outcome;
  tierOk: boolean;
  reasonOk: boolean;
  /** "field: expected X, got Y" for every fact or requirement that is wrong. */
  misses: string[];
  facts: Array<{ field: string; ok: boolean }>;
  claims: number;
  overruled: string[];
}

function grade(c: EvalCase, outcome: Outcome): Graded {
  const { result, entry } = outcome;
  const graded: Graded = {
    outcome,
    tierOk: false,
    reasonOk: false,
    misses: [],
    facts: [],
    claims: 0,
    overruled: [],
  };
  if (!result || !entry) {
    graded.misses.push(outcome.error ? `failed: ${outcome.error}` : "skipped by the model");
    return graded;
  }

  graded.tierOk = asList(c.expect.chance).includes(result.chance);
  const reasons = [result.blocker, ...result.downgrades].filter(Boolean).join(" | ");
  graded.reasonOk = !c.expect.reason || c.expect.reason.test(reasons);
  if (!graded.tierOk) {
    graded.misses.push(
      `tier: expected ${asList(c.expect.chance).map(tier).join(" or ")}, got ${tier(result.chance)}` +
        (reasons ? ` (${reasons})` : ""),
    );
  } else if (!graded.reasonOk) {
    graded.misses.push(`reason: expected ${c.expect.reason}, got "${reasons}"`);
  }

  const facts = readPostingFacts(entry, jobs.get(c.id)!);
  const checks: Array<[string, unknown, unknown]> = [
    ["arrangement", c.expect.arrangement, result.work_arrangement],
    ["contract", c.expect.contract, facts.contractForm],
    ["years", c.expect.years, facts.requiredYears],
    ["level", c.expect.level, facts.level],
    ["work time", c.expect.workTime, facts.workTime],
  ];
  for (const [field, expected, got] of checks) {
    if (expected === undefined) continue;
    const ok = asList(expected as unknown[]).includes(got);
    graded.facts.push({ field, ok });
    if (!ok)
      graded.misses.push(
        `${field}: expected ${asList(expected).map(show).join(" or ")}, got ${show(got)}`,
      );
  }

  for (const check of c.expect.requirements ?? []) {
    const found = result.requirements.find((r) => check.match.test(r.text));
    const ok =
      check.status === "absent" ? !found : !!found && asList(check.status).includes(found.status);
    graded.facts.push({ field: "requirement", ok });
    if (!ok) {
      graded.misses.push(
        `requirement ${check.match}: expected ${check.status}, got ` +
          (found ? `"${found.text}" ${found.status}` : "not listed"),
      );
    }
  }

  // The model's met/partial claims, and the ones the evidence check overruled.
  const raw = normalizeRequirements(entry.requirements);
  raw.forEach((claim: Requirement, i) => {
    if (claim.status === "missing") return;
    graded.claims++;
    const checked = result.requirements[i];
    if (checked && checked.status !== claim.status) {
      graded.overruled.push(
        `${claim.text}: ${claim.status} → ${checked.status}` +
          (claim.evidence ? ` (quoted "${claim.evidence}")` : " (no quote)"),
      );
    }
  });
  return graded;
}

// ---- report -------------------------------------------------------------------

const pct = (n: number, of: number) => (of === 0 ? "–" : `${Math.round((n / of) * 100)} %`);
const ratio = (n: number, of: number) => `${n}/${of} (${pct(n, of)})`;

function report(graded: Map<string, Graded[]>, stats: ChunkStat[]): string {
  const all = [...graded.values()].flat();
  const answered = all.filter((g) => g.outcome.result);
  const tierOk = all.filter((g) => g.tierOk).length;
  const rightReason = all.filter((g) => g.tierOk && g.reasonOk).length;
  const stable = [...graded.values()].filter(
    (runs) =>
      runs.every((g) => g.outcome.result) &&
      new Set(runs.map((g) => g.outcome.result!.chance)).size === 1,
  ).length;
  const claims = all.reduce((sum, g) => sum + g.claims, 0);
  const overruled = all.flatMap((g) => g.overruled);
  const costed = stats.filter((s) => s.usages.length > 0 && s.usages.every((u) => u.cost != null));
  const cost = costed.reduce((a, s) => a + s.usages.reduce((b, u) => b + (u.cost ?? 0), 0), 0);
  const jobsCosted = costed.reduce((a, s) => a + s.jobs, 0);
  const repaired = stats.filter((s) => s.usages.length > 1).length;
  const avgMs = stats.reduce((a, s) => a + s.ms, 0) / Math.max(1, stats.length);

  const factFields = ["arrangement", "contract", "years", "level", "work time", "requirement"];
  const factRows = factFields.map((field) => {
    const checks = all.flatMap((g) => g.facts.filter((f) => f.field === field));
    return `| ${field === "requirement" ? "requirement status" : field} | ${ratio(checks.filter((f) => f.ok).length, checks.length)} |`;
  });

  const date = new Date().toISOString().slice(0, 10);
  const out = [
    "# Evaluation: chance scoring",
    "",
    `Run on ${date} with \`npm run eval\`: ${cases.length} test postings ([cases.ts](cases.ts)), ` +
      `each scored ${RUNS} times by \`${AI_MODEL}\` through the real scoring code ` +
      `(scoring version ${SCORING_VERSION}). Method: [README.md](README.md).`,
    "",
    "| | |",
    "|---|---:|",
    `| **Right tier** | **${ratio(tierOk, all.length)}** |`,
    `| Right tier for the right reason | ${ratio(rightReason, all.length)} |`,
    `| Same tier in all ${RUNS} runs | ${ratio(stable, graded.size)} |`,
    `| Jobs without an answer (skipped or failed) | ${all.length - answered.length} |`,
    `| Model claims (met/partly met) overruled by the evidence check | ${ratio(overruled.length, claims)} |`,
    `| Answers that needed a repair (wrong format) | ${ratio(repaired, stats.length)} |`,
    `| Avg. time per chunk (${CHUNK_SIZE} jobs) | ${(avgMs / 1000).toFixed(1)} s |`,
    `| Cost per job | ${jobsCosted ? `$${(cost / jobsCosted).toFixed(5)}` : "–"} |`,
    "",
    "## Facts read from the postings",
    "",
    "| Fact | Correct |",
    "|---|---:|",
    ...factRows,
    "",
    "## Per case",
    "",
    `| Case | Expected | ${Array.from({ length: RUNS }, (_, i) => `Run ${i + 1}`).join(" | ")} |`,
    `|---|---|${"---|".repeat(RUNS)}`,
    ...cases.map((c) => {
      const runs = graded.get(c.id)!;
      const cells = runs.map((g) =>
        g.outcome.result
          ? `${tier(g.outcome.result.chance)} ${g.tierOk && g.reasonOk && g.misses.length === 0 ? "✓" : "✗"}`
          : "– ✗",
      );
      return `| \`${c.id}\` | ${asList(c.expect.chance).map(tier).join(" / ")} | ${cells.join(" | ")} |`;
    }),
    "",
    "✓ = right tier, right reason and every checked fact right.",
    "",
    "## What went wrong",
    "",
  ];

  const failing = cases.filter((c) => graded.get(c.id)!.some((g) => g.misses.length > 0));
  if (failing.length === 0) out.push("Nothing: every run of every case was right.");
  for (const c of failing) {
    out.push(`**\`${c.id}\`**: ${c.why}`, "");
    for (const g of graded.get(c.id)!) {
      if (g.misses.length > 0) out.push(`- Run ${g.outcome.run}: ${g.misses.join("; ")}`);
    }
    out.push("");
  }

  out.push("## Claims the evidence check overruled", "");
  if (overruled.length === 0) out.push("None.");
  const counts = new Map<string, number>();
  for (const o of overruled) counts.set(o, (counts.get(o) ?? 0) + 1);
  for (const [text, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    out.push(`- ${text}${n > 1 ? ` (${n}×)` : ""}`);
  }
  out.push("", `Total AI cost of this run: $${cost.toFixed(4)}.`, "");
  return out.join("\n");
}

// ---- main ---------------------------------------------------------------------

async function main() {
  if (cases.length === 0) throw new Error(`No case matches --only ${ONLY}`);
  console.log(`Scoring ${cases.length} postings × ${RUNS} runs with ${AI_MODEL} …`);

  const stats: ChunkStat[] = [];
  const graded = new Map<string, Graded[]>(cases.map((c) => [c.id, []]));
  const outcomes: Outcome[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const results = await runOnce(run, stats);
    outcomes.push(...results);
    for (const outcome of results) {
      const c = cases.find((x) => x.id === outcome.caseId)!;
      graded.get(c.id)!.push(grade(c, outcome));
    }
    const right = results.filter((o) => graded.get(o.caseId)!.at(-1)!.tierOk).length;
    console.log(`Run ${run}: ${right}/${results.length} right tier`);
  }

  const markdown = report(graded, stats);
  console.log(`\n${markdown}`);

  if (SAVE) {
    const date = new Date().toISOString().slice(0, 10);
    mkdirSync(path.join(EVAL_DIR, "results"), { recursive: true });
    writeFileSync(path.join(EVAL_DIR, "RESULTS.md"), markdown);
    // Never overwrite an earlier run of the same day and version.
    let name = `${date}-v${SCORING_VERSION}`;
    for (let n = 2; existsSync(path.join(EVAL_DIR, "results", `${name}.md`)); n++) {
      name = `${date}-v${SCORING_VERSION}-${n}`;
    }
    writeFileSync(path.join(EVAL_DIR, "results", `${name}.md`), markdown);
    writeFileSync(
      path.join(EVAL_DIR, "results", "latest.json"),
      JSON.stringify(
        { date, model: AI_MODEL, scoringVersion: SCORING_VERSION, runs: RUNS, outcomes },
        null,
        2,
      ),
    );
    console.log(`Saved eval/RESULTS.md and eval/results/${name}.md.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
