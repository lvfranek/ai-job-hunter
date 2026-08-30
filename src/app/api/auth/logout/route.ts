import { NextResponse } from "next/server";
import { COOKIE_NAME, DEMO_COOKIE_NAME, DEMO_SCORED_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  // Also exit demo mode, if that's how the visitor got in.
  res.cookies.delete(DEMO_COOKIE_NAME);
  res.cookies.delete(DEMO_SCORED_COOKIE_NAME);
  return res;
}
