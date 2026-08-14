import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, isValidSessionCookie } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/cron/scrape has its own bearer-token auth (CRON_SECRET) for external
  // schedulers that can't hold the session cookie — enforced in the route itself.
  if (pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/cron/scrape") {
    return NextResponse.next();
  }

  if (isValidSessionCookie(request.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-icon|icon).*)"],
};
