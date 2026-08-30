import { NextResponse } from "next/server";
import { DEMO_COOKIE_NAME, DEMO_COOKIE_MAX_AGE } from "@/lib/auth";

// Enters guest/demo mode — no password. Grants access only to canned fixtures
// and no-op writes (see src/app/api/demo + src/proxy.ts).
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE_NAME, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DEMO_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
