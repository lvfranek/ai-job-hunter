import crypto from "crypto";
import type { NextRequest } from "next/server";

export const COOKIE_NAME = "job_hunter_session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Guest/demo mode. This cookie unlocks a read-only tour backed entirely by canned
// fixtures (see src/lib/demo-data.ts + src/app/api/demo). It guards nothing
// sensitive — no real data, no writes, no paid API calls — so it's a plain flag,
// not a signed token.
export const DEMO_COOKIE_NAME = "job_hunter_demo";
export const DEMO_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
// Set by POST /api/demo/score so GET /api/demo/jobs can return the "scored" fixtures.
export const DEMO_SCORED_COOKIE_NAME = "job_hunter_demo_scored";

// Emails compare case- and whitespace-insensitively, so "Me@Example.com " still matches.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function configuredEmail(): string {
  const email = process.env.AUTH_EMAIL;
  if (!email) throw new Error("AUTH_EMAIL is not set");
  return normalizeEmail(email);
}

function verifyEmail(email: string): boolean {
  // Hash both sides so timingSafeEqual always sees equal-length buffers.
  const digest = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(digest(normalizeEmail(email)), digest(configuredEmail()));
}

// Always runs the scrypt check, even for a wrong email, so response timing doesn't
// reveal whether the email was right.
export function verifyLogin(email: string, password: string): boolean {
  const emailOk = verifyEmail(email);
  const passwordOk = verifyPassword(password);
  return emailOk && passwordOk;
}

function verifyPassword(password: string): boolean {
  const raw = process.env.AUTH_PASSWORD_HASH;
  if (!raw) throw new Error("AUTH_PASSWORD_HASH is not set");
  const [salt, hashHex] = raw.split(":");
  const expected = Buffer.from(hashHex, "hex");
  // salt is used as-is (not hex-decoded) to match the generation one-liner in
  // .env.local.example / README, which also passes the salt string directly to scrypt.
  const derived = crypto.scryptSync(password, salt, expected.length);
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// Static token: HMAC(AUTH_PASSWORD_HASH, "session:<email>"). No per-login randomness —
// simplest design for a single-user personal-tool gate. There's no server-side revocation
// short of changing AUTH_PASSWORD_HASH or AUTH_EMAIL.
// ponytail: static signed cookie, no revocation — add a sessions table if that's ever needed
export function sessionToken(): string {
  const raw = process.env.AUTH_PASSWORD_HASH || "";
  const email = normalizeEmail(process.env.AUTH_EMAIL || "");
  return crypto.createHmac("sha256", raw).update(`session:${email}`).digest("hex");
}

export function isValidSessionCookie(value: string | undefined): boolean {
  if (!value || !process.env.AUTH_PASSWORD_HASH || !process.env.AUTH_EMAIL) return false;
  const expected = Buffer.from(sessionToken());
  const actual = Buffer.from(value);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// True when the request carries the demo cookie. Used by the money-spending routes
// as a belt-and-suspenders guard — the proxy already rewrites demo traffic to
// /api/demo/* before it can reach them.
export function isDemoRequest(request: NextRequest): boolean {
  return request.cookies.get(DEMO_COOKIE_NAME)?.value === "1";
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
