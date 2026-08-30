import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  DEMO_COOKIE_NAME,
  DEMO_SCORED_COOKIE_NAME,
  sessionToken,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { password } = (await request.json()) as { password?: string };

  if (!password || !verifyPassword(password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
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
