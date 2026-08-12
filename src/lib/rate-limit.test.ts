import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RATE_LIMITS,
  checkRateLimit,
  enforceRateLimit,
  resetRateLimits,
} from "./rate-limit";

const rule = { perMinute: 60, burst: 5 };

beforeEach(() => {
  resetRateLimits();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows a full burst then blocks", () => {
    for (let i = 0; i < rule.burst; i++) {
      expect(checkRateLimit("client", rule).allowed).toBe(true);
    }

    expect(checkRateLimit("client", rule).allowed).toBe(false);
  });

  it("counts down the remaining allowance", () => {
    expect(checkRateLimit("client", rule).remaining).toBe(4);
    expect(checkRateLimit("client", rule).remaining).toBe(3);
  });

  it("refills over time at the sustained rate", () => {
    for (let i = 0; i < rule.burst; i++) checkRateLimit("client", rule);
    expect(checkRateLimit("client", rule).allowed).toBe(false);

    // 60/minute is one token per second.
    vi.advanceTimersByTime(1_000);
    expect(checkRateLimit("client", rule).allowed).toBe(true);
    expect(checkRateLimit("client", rule).allowed).toBe(false);
  });

  it("never refills beyond the burst ceiling", () => {
    checkRateLimit("client", rule);
    vi.advanceTimersByTime(10 * 60_000);

    for (let i = 0; i < rule.burst; i++) {
      expect(checkRateLimit("client", rule).allowed).toBe(true);
    }
    expect(checkRateLimit("client", rule).allowed).toBe(false);
  });

  it("suggests a retry delay when blocked", () => {
    for (let i = 0; i < rule.burst; i++) checkRateLimit("client", rule);

    const blocked = checkRateLimit("client", rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("tracks clients independently", () => {
    for (let i = 0; i < rule.burst; i++) checkRateLimit("alice", rule);

    expect(checkRateLimit("alice", rule).allowed).toBe(false);
    expect(checkRateLimit("bob", rule).allowed).toBe(true);
  });
});

describe("budget shape", () => {
  it("meters expensive scans far harder than cheap live ticks", () => {
    expect(RATE_LIMITS.scan.perMinute).toBeLessThan(RATE_LIMITS.live.perMinute);
  });

  it("lets a one-second poll through the live budget with headroom", () => {
    expect(RATE_LIMITS.live.perMinute).toBeGreaterThan(60);
  });
});

describe("enforceRateLimit", () => {
  function request(ip: string): Request {
    return new Request("https://example.test/api/thing", {
      headers: { "x-forwarded-for": ip },
    });
  }

  it("returns null while the caller is within budget", () => {
    expect(enforceRateLimit(request("1.1.1.1"), "scan")).toBeNull();
  });

  it("returns a 429 with a Retry-After header once over budget", () => {
    const limit = RATE_LIMITS.scan.burst;
    for (let i = 0; i < limit; i++) {
      enforceRateLimit(request("2.2.2.2"), "scan");
    }

    const response = enforceRateLimit(request("2.2.2.2"), "scan");
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    expect(response!.headers.get("Retry-After")).toBeTruthy();
  });

  it("keeps separate budgets per scope for the same client", () => {
    for (let i = 0; i < RATE_LIMITS.scan.burst; i++) {
      enforceRateLimit(request("3.3.3.3"), "scan");
    }

    expect(enforceRateLimit(request("3.3.3.3"), "scan")).not.toBeNull();
    expect(enforceRateLimit(request("3.3.3.3"), "live")).toBeNull();
  });

  it("uses the first hop of a forwarded-for chain", () => {
    const chained = new Request("https://example.test/api/thing", {
      headers: { "x-forwarded-for": "4.4.4.4, 10.0.0.1" },
    });

    for (let i = 0; i < RATE_LIMITS.scan.burst; i++) {
      enforceRateLimit(chained, "scan");
    }

    expect(enforceRateLimit(request("4.4.4.4"), "scan")).not.toBeNull();
  });
});
