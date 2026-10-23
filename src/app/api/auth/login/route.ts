import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  DEMO_COOKIE_NAME,
  DEMO_SCORED_COOKIE_NAME,
  sessionToken,
  verifyLogin,
} from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

// This route is public (see src/proxy.ts), so it is the one brute-force target
// in the app — a single login with no account lockout behind it.
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const { allowed, retryAfter } = rateLimit(`login:${clientKey(request)}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { email, password } = (await request.json()) as { email?: string; password?: string };

  if (!email || !password || !verifyLogin(email, password)) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  // A real login supersedes any demo session.
  res.cookies.delete(DEMO_COOKIE_NAME);
  res.cookies.delete(DEMO_SCORED_COOKIE_NAME);
  return res;
}
