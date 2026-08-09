import type { Settings } from "./types";

const apifyApiKey = process.env.APIFY_API_KEY || "";
const apifyBaseUrl = "https://api.apify.com/v2";

export interface ApifyRunInput {
  [key: string]: unknown;
}

/**
 * Trigger an Apify scraper task. Returns the run ID.
 */
export async function triggerApifyScraper(
  scraperId: string,
  inputs: ApifyRunInput
): Promise<string> {
  const res = await fetch(`${apifyBaseUrl}/acts/${scraperId}/runs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apifyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(inputs),
  });

  if (!res.ok) {
    throw new Error(`Apify trigger failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.data.id;
}

/**
 * Get results from a completed Apify run. Returns array of job listings.
 */
export async function getScraperResults(runId: string): Promise<unknown[]> {
  try {
    const res = await fetch(`${apifyBaseUrl}/actor-runs/${runId}/dataset/items`, {
      headers: { Authorization: `Bearer ${apifyApiKey}` },
    });
    if (!res.ok) return [];
    return (await res.json()) || [];
  } catch (error) {
    console.error("Error fetching Apify results:", error);
    return [];
  }
}

/**
 * Get status of an Apify run.
 */
export async function getScraperStatus(runId: string): Promise<string> {
  try {
    const res = await fetch(`${apifyBaseUrl}/actor-runs/${runId}`, {
      headers: { Authorization: `Bearer ${apifyApiKey}` },
    });
    if (!res.ok) return "unknown";
    const data = await res.json();
    return data.data.status;
  } catch (error) {
    console.error("Error fetching Apify status:", error);
    return "unknown";
  }
}

/**
 * Poll an Apify run until it finishes, then return the dataset items.
 * Polls every 2s, ~5 minute timeout (150 attempts).
 */
export async function pollApifyRun(runId: string, maxAttempts = 150): Promise<unknown[]> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getScraperStatus(runId);
    if (status === "SUCCEEDED") return getScraperResults(runId);
    if (status === "FAILED" || status === "ABORTED") {
      throw new Error(`Apify run ${status.toLowerCase()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Apify run timed out");
}

export interface ScrapedJob {
  url: string;
  title: string;
  company: string;
  description: string;
  platform: string;
  posted_date: string | null;
}

// Only portals with a real actor ID (below) and a scraper implementation (in
// route.ts's PORTAL_SCRAPERS) actually run. Arbeitsagentur has neither yet.
export type Portal = "indeed" | "linkedin" | "stepstone" | "xing" | "arbeitsagentur";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface IndeedRawJob {
  url: string;
  title: string;
  description?: { text?: string };
  datePublished?: string;
  dateOnIndeed?: string;
  employer?: { name?: string };
}

/** Build inputs for the valig/indeed-jobs-scraper Apify actor. */
export function buildIndeedInputs(settings: Settings): ApifyRunInput {
  return {
    country: "de",
    title: settings.scraper_search_keywords.join(" OR "),
    // The actor accepts the literal string "remote" as a location, filtering at
    // the source instead of scraping everything and discarding on-site jobs after.
    location: settings.remote_only ? "remote" : settings.scraper_location || "Germany",
    limit: settings.scraper_results_per_scan,
  };
}

/** Map a raw indeed-jobs-scraper dataset item to our job row shape. */
export function mapIndeedJob(raw: unknown): ScrapedJob {
  const job = raw as IndeedRawJob;
  return {
    url: job.url,
    title: job.title,
    company: job.employer?.name || "Unknown",
    description: job.description?.text || "",
    platform: "indeed",
    posted_date: job.datePublished || job.dateOnIndeed || null,
  };
}

interface LinkedinRawJob {
  url: string;
  title: string;
  location?: string;
  companyName?: string;
  description?: string;
  postedDate?: string;
}

/** Build inputs for the valig/linkedin-jobs-scraper Apify actor. */
export function buildLinkedinInputs(settings: Settings): ApifyRunInput {
  return {
    title: settings.scraper_search_keywords.join(" OR "),
    location: settings.scraper_location || "Germany",
    // "2" = Remote in the actor's own remote-work-option enum.
    remote: settings.remote_only ? ["2"] : undefined,
    limit: settings.scraper_results_per_scan,
  };
}

/** Map a raw linkedin-jobs-scraper dataset item to our job row shape. */
export function mapLinkedinJob(raw: unknown): ScrapedJob {
  const job = raw as LinkedinRawJob;
  return {
    url: job.url,
    title: job.title,
    company: job.companyName || "Unknown",
    description: job.description || "",
    platform: "linkedin",
    posted_date: job.postedDate || null,
  };
}

interface StepstoneRawJob {
  url: string;
  title: string;
  datePosted?: string;
  location?: { location?: string };
  company?: { name?: string };
  textSnippet?: string;
  textSections?: { content?: string }[];
}

/** Build inputs for the valig/stepstone-jobs-scraper Apify actor. */
export function buildStepstoneInputs(settings: Settings): ApifyRunInput {
  return {
    keywords: settings.scraper_search_keywords.join(" OR "),
    location: settings.scraper_location || "Germany",
    // "2" = Fully remote in the actor's own work-from-home-options enum.
    wfh: settings.remote_only ? "2" : undefined,
    limit: settings.scraper_results_per_scan,
  };
}

/** Map a raw stepstone-jobs-scraper dataset item to our job row shape. */
export function mapStepstoneJob(raw: unknown): ScrapedJob {
  const job = raw as StepstoneRawJob;
  const sections = (job.textSections ?? []).map((s) => stripHtml(s.content ?? "")).join("\n\n");
  return {
    url: job.url,
    title: job.title,
    company: job.company?.name || "Unknown",
    description: [job.textSnippet, sections].filter(Boolean).join("\n\n"),
    platform: "stepstone",
    posted_date: job.datePosted || null,
  };
}

interface XingRawJob {
  url: string;
  title: string;
  company?: string;
  description_text?: string;
  description_html?: string;
  date_posted?: string;
}

/** Build inputs for the shahidirfan/xing-jobs-scraper Apify actor. */
export function buildXingInputs(settings: Settings): ApifyRunInput {
  const keyword = settings.scraper_search_keywords.join(" OR ");
  return {
    // Xing's actor has no dedicated remote filter — append "remote" to the search
    // term instead, same as the site's own "remote" job category search.
    keyword: settings.remote_only ? `${keyword} remote` : keyword,
    location: settings.remote_only ? "" : settings.scraper_location || "Germany",
    results_wanted: settings.scraper_results_per_scan,
  };
}

/** Map a raw xing-jobs-scraper dataset item to our job row shape. */
export function mapXingJob(raw: unknown): ScrapedJob {
  const job = raw as XingRawJob;
  return {
    url: job.url,
    title: job.title,
    company: job.company || "Unknown",
    description: job.description_text || stripHtml(job.description_html || ""),
    platform: "xing",
    posted_date: job.date_posted || null,
  };
}
