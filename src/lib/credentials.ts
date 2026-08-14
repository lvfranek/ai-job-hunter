import crypto from "crypto";
import { getSupabaseServerClient, CURRENT_USER_ID } from "./supabase";

const ENV_FALLBACK = {
  apify_api_key: process.env.APIFY_API_KEY,
  apify_scraper_indeed: process.env.APIFY_SCRAPER_INDEED,
  apify_scraper_linkedin: process.env.APIFY_SCRAPER_LINKEDIN,
  apify_scraper_xing: process.env.APIFY_SCRAPER_XING,
  apify_scraper_stepstone: process.env.APIFY_SCRAPER_STEPSTONE,
  apify_scraper_arbeitsagentur: process.env.APIFY_SCRAPER_ARBEITSAGENTUR,
  openrouter_api_key: process.env.OPENROUTER_API_KEY,
  openrouter_model: process.env.OPENROUTER_MODEL,
} as const;

export type CredentialKey = keyof typeof ENV_FALLBACK;
export const SECRET_KEYS: CredentialKey[] = ["apify_api_key", "openrouter_api_key"];

function getEncryptionKey(): Buffer {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  return key;
}

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

function decrypt(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

async function getStoredValue(key: CredentialKey): Promise<string | null> {
  const { data } = await getSupabaseServerClient()
    .from("credentials")
    .select("encrypted_value")
    .eq("user_id", CURRENT_USER_ID)
    .eq("key", key)
    .maybeSingle();
  return data?.encrypted_value ? decrypt(data.encrypted_value) : null;
}

export async function getCredential(key: CredentialKey): Promise<string> {
  const stored = await getStoredValue(key);
  return stored ?? ENV_FALLBACK[key] ?? "";
}

export async function setCredential(key: CredentialKey, value: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!value) {
    const { error } = await supabase
      .from("credentials")
      .delete()
      .eq("user_id", CURRENT_USER_ID)
      .eq("key", key);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("credentials").upsert(
    { user_id: CURRENT_USER_ID, key, encrypted_value: encrypt(value), updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" }
  );
  if (error) throw error;
}

export interface CredentialStatus {
  configured: boolean;
  last4: string | null;
  source: "db" | "env" | "none";
}

export async function getCredentialStatus(key: CredentialKey): Promise<CredentialStatus> {
  const stored = await getStoredValue(key);
  if (stored) return { configured: true, last4: stored.slice(-4), source: "db" };
  const fromEnv = ENV_FALLBACK[key];
  if (fromEnv) return { configured: true, last4: fromEnv.slice(-4), source: "env" };
  return { configured: false, last4: null, source: "none" };
}
