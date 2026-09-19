import type { NextRequest } from "next/server";

// In-memory fixed-window limiter. Deliberately not Redis/Upstash: this is a
// single-user personal tool on one instance, where the only realistic threat is
// someone brute-forcing the single password. Per-instance counters are enough
// for that and add no infrastructure. It resets on deploy/restart, and on a
// multi-instance host each instance counts separately.
const hits = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets — for the Retry-After header. */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    // Drop expired entries so a stream of unique keys can't grow the map forever.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    }
    return { allowed: true, retryAfter: 0 };
  }

  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  };
}

/**
 * Best-effort client identity. Behind a proxy (Vercel, nginx) the socket address
 * is the proxy's, so the forwarded headers are the only per-client signal — and
 * they are spoofable, which is acceptable here: this throttles casual brute
 * force, it is not an access control.
 */
export function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
