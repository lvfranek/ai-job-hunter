// Guest/demo mode: every /api/* request from a visitor holding the demo cookie is
// rewritten here by src/proxy.ts. Nothing in this file touches Supabase, Apify,
// OpenRouter or the notification webhook — it only serves the fixtures in
// src/lib/demo-data.ts and runs the local, network-free .docx builder.
import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_SCORED_COOKIE_NAME,
  DEMO_COOKIE_MAX_AGE,
} from "@/lib/auth";
import {
  demoJobs,
  demoJobsScored,
  demoPreferences,
  demoSettings,
  demoProfile,
  demoParsedCv,
  demoCredentials,
  demoScrapeStatus,
  demoScoreStatus,
  demoCoverLetterParagraphs,
  findDemoJob,
} from "@/lib/demo-data";
import { generateCoverLetterDocx } from "@/lib/generate-coverletter";
import type { CoverLetterLanguage } from "@/lib/agents/agent-4";
import type { DbJob, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "").trim();
}

/**
 * The path after the `/api` prefix, e.g. "/jobs", "/scrape/status", "/jobs/demo-job-x".
 * A proxy rewrite is transparent to the handler, so `request.nextUrl.pathname` is
 * still the client's original `/api/...` path (not `/api/demo/...`).
 */
function subPath(request: NextRequest): string {
  return (
    request.nextUrl.pathname.replace(/^\/api\/demo/, "").replace(/^\/api/, "") || "/"
  );
}

async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  return request
    .json()
    .then((v) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {}))
    .catch(() => ({}));
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const path = subPath(request);
  const method = request.method;

  // ---- reads -------------------------------------------------------------
  if (method === "GET") {
    switch (path) {
      case "/jobs": {
        const scored = request.cookies.get(DEMO_SCORED_COOKIE_NAME)?.value === "1";
        return NextResponse.json(scored ? demoJobsScored : demoJobs);
      }
      case "/preferences":
        return NextResponse.json(demoPreferences);
      case "/settings":
        return NextResponse.json({ ...demoSettings, webhook_configured: true });
      case "/profile":
        return NextResponse.json(demoProfile);
      case "/credentials":
        return NextResponse.json(demoCredentials);
      case "/scrape/status":
        return NextResponse.json(demoScrapeStatus);
      case "/score/status":
        return NextResponse.json(demoScoreStatus);
    }
  }

  // ---- simulated pipelines --------------------------------------------------
  if (method === "POST" && path === "/scrape") {
    await sleep(1200); // let the "Scraping…" indicator show
    return NextResponse.json({ runId: "demo" });
  }

  if (method === "POST" && path === "/score") {
    const res = NextResponse.json({ runId: "demo" });
    // Makes GET /jobs return the fully-scored fixtures from here on.
    res.cookies.set(DEMO_SCORED_COOKIE_NAME, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: DEMO_COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  }

  if (method === "POST" && path === "/score/cancel") {
    return NextResponse.json({ cancelled: true });
  }

  // ---- cover letter: real local .docx, canned body, no LLM ----------------
  if (method === "POST" && path === "/coverletter") {
    const body = await readJson(request);
    const language: CoverLetterLanguage = body.language === "en" ? "en" : "de";
    const job = findDemoJob(body.jobId as string | undefined) ?? demoJobs[0];
    const buffer = await generateCoverLetterDocx(
      demoProfile as Profile,
      job as DbJob,
      demoCoverLetterParagraphs[language],
      language
    );
    const filename = `${
      language === "de" ? "Anschreiben" : "Cover Letter"
    } ${sanitizeFilenamePart(job.company)}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // ---- CV parse: canned result, uploaded file ignored --------------------
  if (method === "POST" && path === "/profile/parse") {
    return NextResponse.json(demoParsedCv);
  }

  // ---- writes: accepted, never persisted --------------------------------
  if (method === "POST" && (path === "/profile" || path === "/preferences" || path === "/settings")) {
    const body = await readJson(request);
    return NextResponse.json({ ...body, demo: true });
  }

  if (method === "POST" && path === "/credentials") {
    return NextResponse.json({ ok: true, demo: true });
  }

  if (method === "POST" && path === "/jobs") {
    const body = await readJson(request);
    return NextResponse.json({
      id: `demo-job-${crypto.randomUUID()}`,
      user_id: "demo",
      created_at: new Date().toISOString(),
      deleted_at: null,
      ...body,
      demo: true,
    });
  }

  if (method === "DELETE" && path === "/jobs") {
    // Fixtures are never persisted, so nothing is actually removed.
    return NextResponse.json({ deleted: 0, demo: true });
  }

  if (method === "PATCH" && path.startsWith("/jobs/")) {
    const id = path.slice("/jobs/".length);
    const body = await readJson(request);
    const job = findDemoJob(id) ?? demoJobs[0];
    return NextResponse.json({ ...job, status: (body.status as string | null) ?? null, demo: true });
  }

  return NextResponse.json({ error: `Unknown demo route: ${method} ${path}` }, { status: 404 });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
