import { NextRequest, NextResponse } from "next/server";
import { getCredential, getCredentialStatus, setCredential, SECRET_KEYS, type CredentialKey } from "@/lib/credentials";

const CONFIG_KEYS: CredentialKey[] = [
  "apify_scraper_indeed",
  "apify_scraper_linkedin",
  "apify_scraper_xing",
  "apify_scraper_stepstone",
  "apify_scraper_arbeitsagentur",
  "openrouter_model",
];

export async function GET() {
  try {
    const [secretEntries, configEntries] = await Promise.all([
      Promise.all(SECRET_KEYS.map(async (key) => [key, await getCredentialStatus(key)] as const)),
      Promise.all(CONFIG_KEYS.map(async (key) => [key, await getCredential(key)] as const)),
    ]);

    return NextResponse.json({
      secrets: Object.fromEntries(secretEntries),
      config: Object.fromEntries(configEntries),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      secrets?: Partial<Record<CredentialKey, string>>;
      config?: Partial<Record<CredentialKey, string>>;
    };

    const entries = [...Object.entries(body.secrets ?? {}), ...Object.entries(body.config ?? {})];
    await Promise.all(entries.map(([key, value]) => setCredential(key as CredentialKey, value ?? "")));

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message || String(error) }, { status: 500 });
  }
}
