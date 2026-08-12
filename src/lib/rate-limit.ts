import { NextResponse } from "next/server";

/**
 * Token-bucket rate limiting, keyed by client IP.
 *
 * The buckets live in module scope, so limits are per server instance. That is
 * the right tradeoff for a small single-instance deployment: it needs no
 * external dependency and still stops one client from draining the upstream
 * data quota. A multi-instance deployment would want a shared store.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitRule {
  /** Sustained requests allowed per minute. */
  perMinute: number;
  /** Requests allowed in a single burst before the sustained rate applies. */
  burst: number;
}

/**
 * Budgets reflect cost, not fairness. A full scan fans out to well over a
 * hundred upstream requests, so it is metered far harder than a live tick,
 * which is a single batched quote lookup shared through the cache.
 */
export const RATE_LIMITS = {
  scan: { perMinute: 10, burst: 3 },
  live: { perMinute: 120, burst: 20 },
  analyze: { perMinute: 30, burst: 10 },
  search: { perMinute: 60, burst: 15 },
  read: { perMinute: 120, burst: 30 },
  /**
   * Image import is the only route that spends real money per call, so it is
   * metered far tighter than anything else here.
   */
  import: { perMinute: 5, burst: 2 },
} as const satisfies Record<string, RateLimitRule>;

const MAX_BUCKETS = 10_000;
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  rule: RateLimitRule
): RateLimitResult {
  const now = Date.now();
  const refillPerMs = rule.perMinute / 60_000;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: rule.burst, updatedAt: now };
  } else {
    const refilled = bucket.tokens + (now - bucket.updatedAt) * refillPerMs;
    bucket.tokens = Math.min(rule.burst, refilled);
    bucket.updatedAt = now;
  }

  // Re-insert so the eviction below drops the least recently seen client.
  buckets.delete(key);
  buckets.set(key, bucket);

  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }

  if (bucket.tokens < 1) {
    const deficit = 1 - bucket.tokens;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(deficit / refillPerMs / 1000)),
    };
  }

  bucket.tokens -= 1;
  return {
    allowed: true,
    remaining: Math.floor(bucket.tokens),
    retryAfterSeconds: 0,
  };
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Returns a 429 response when the caller is over budget, or null to proceed.
 */
export function enforceRateLimit(
  request: Request,
  scope: keyof typeof RATE_LIMITS
): NextResponse | null {
  const rule = RATE_LIMITS[scope];
  const result = checkRateLimit(`${scope}:${clientKey(request)}`, rule);

  if (result.allowed) return null;

  return NextResponse.json(
    {
      error: `Too many requests. Try again in ${result.retryAfterSeconds}s.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

/** Test seam. */
export function resetRateLimits(): void {
  buckets.clear();
}
