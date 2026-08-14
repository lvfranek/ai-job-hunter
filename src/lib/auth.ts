import crypto from "crypto";

export const COOKIE_NAME = "job_hunter_session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function verifyPassword(password: string): boolean {
  const raw = process.env.AUTH_PASSWORD_HASH;
  if (!raw) throw new Error("AUTH_PASSWORD_HASH is not set");
  const [salt, hashHex] = raw.split(":");
  const expected = Buffer.from(hashHex, "hex");
  // salt is used as-is (not hex-decoded) to match the generation one-liner in
  // .env.local.example / README, which also passes the salt string directly to scrypt.
  const derived = crypto.scryptSync(password, salt, expected.length);
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// Static token: HMAC(AUTH_PASSWORD_HASH, "session"). No per-login randomness — simplest
// design for a single-password personal-tool gate. There's no server-side revocation
// short of rotating AUTH_PASSWORD_HASH.
// ponytail: static signed cookie, no revocation — add a sessions table if that's ever needed
export function sessionToken(): string {
  const raw = process.env.AUTH_PASSWORD_HASH || "";
  return crypto.createHmac("sha256", raw).update("session").digest("hex");
}

export function isValidSessionCookie(value: string | undefined): boolean {
  if (!value || !process.env.AUTH_PASSWORD_HASH) return false;
  const expected = Buffer.from(sessionToken());
  const actual = Buffer.from(value);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// For the cron endpoint: "Authorization: Bearer <CRON_SECRET>". Doesn't distinguish
// missing vs. wrong in its return value — callers should respond identically either way.
export function isValidCronToken(authorizationHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  const match = authorizationHeader?.match(/^Bearer (.+)$/);
  if (!secret || !match) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(match[1]);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
