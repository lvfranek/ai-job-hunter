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
    location: settings.scraper_location || "Germany",
    limit: settings.scraper_results_per_scan,
  };
}

/** Map a raw indeed-jobs-scraper dataset item to our job row shape. */
export function mapIndeedJob(raw: unknown) {
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
