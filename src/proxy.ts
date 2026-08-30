import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, DEMO_COOKIE_NAME, isValidSessionCookie } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public / self-authenticating endpoints.
  // /api/cron/scrape has its own bearer-token auth (CRON_SECRET) for external
  // schedulers that can't hold the session cookie — enforced in the route itself.
  if (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/demo" ||
    pathname === "/api/cron/scrape"
  ) {
    return NextResponse.next();
  }

  // Real, password-holding users — checked before demo so they never see fixtures.
  if (isValidSessionCookie(request.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.next();
  }

  // Guest/demo visitors: serve every API call from the demo catch-all
  // (src/app/api/demo) instead of the real routes.
  if (request.cookies.get(DEMO_COOKIE_NAME)?.value === "1") {
    if (pathname === "/api/auth/logout") {
      return NextResponse.next(); // real handler clears the demo cookie
    }
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/demo/")) {
      const url = request.nextUrl.clone();
      url.pathname = `/api/demo${pathname.slice(4)}`; // /api/jobs -> /api/demo/jobs
      return NextResponse.rewrite(url);
    }
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
