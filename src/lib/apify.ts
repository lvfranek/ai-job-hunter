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
    const res = await fetch(`${apifyBaseUrl}/runs/${runId}/dataset/items`, {
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
    const res = await fetch(`${apifyBaseUrl}/runs/${runId}`, {
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
