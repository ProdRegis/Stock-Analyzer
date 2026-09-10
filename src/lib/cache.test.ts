import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheClear, cacheRead, cacheStats, cacheWrite, cached } from "./cache";

afterEach(() => {
  cacheClear();
  vi.useRealTimers();
});

describe("cached", () => {
  it("calls the loader once for repeated reads inside the TTL", async () => {
    const load = vi.fn(async () => "value");

    expect(await cached("k", 60_000, load)).toBe("value");
    expect(await cached("k", 60_000, load)).toBe("value");
    expect(await cached("k", 60_000, load)).toBe("value");

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent misses into a single upstream call", async () => {
    let resolve: (value: string) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        })
    );

    // Ten callers arrive before the first request settles.
    const pending = Promise.all(
      Array.from({ length: 10 }, () => cached("k", 60_000, load))
    );
    resolve("value");

    expect(await pending).toEqual(new Array(10).fill("value"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads once the TTL has passed", async () => {
    vi.useFakeTimers();
    let counter = 0;
    const load = vi.fn(async () => ++counter);

    expect(await cached("k", 1_000, load)).toBe(1);

    vi.advanceTimersByTime(999);
    expect(await cached("k", 1_000, load)).toBe(1);

    vi.advanceTimersByTime(2);
    expect(await cached("k", 1_000, load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("serves the stale value when a refresh fails", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("fresh")
      .mockRejectedValueOnce(new Error("upstream down"));

    expect(await cached("k", 1_000, load)).toBe("fresh");

    vi.advanceTimersByTime(1_001);
    expect(await cached("k", 1_000, load)).toBe("fresh");
  });

  it("propagates the error when there is nothing stale to fall back on", async () => {
    const load = vi.fn(async () => {
      throw new Error("upstream down");
    });

    await expect(cached("k", 1_000, load)).rejects.toThrow("upstream down");
  });

  it("retries after a failure rather than caching the rejection", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("recovered");

    await expect(cached("k", 60_000, load)).rejects.toThrow("transient");
    expect(await cached("k", 60_000, load)).toBe("recovered");
  });

  it("keeps separate keys independent", async () => {
    expect(await cached("a", 60_000, async () => 1)).toBe(1);
    expect(await cached("b", 60_000, async () => 2)).toBe(2);
    expect(await cached("a", 60_000, async () => 99)).toBe(1);
  });

  it("clears in-flight tracking once a request settles", async () => {
    await cached("k", 60_000, async () => "value");
    expect(cacheStats().inflight).toBe(0);
  });
});

describe("cacheRead and cacheWrite", () => {
  it("round-trips a value within its TTL", () => {
    cacheWrite("k", { price: 1 }, 60_000);
    expect(cacheRead<{ price: number }>("k")).toEqual({ price: 1 });
  });

  it("reports a miss for an unknown key", () => {
    expect(cacheRead("missing")).toBeNull();
  });

  it("reports a miss once the entry has expired", () => {
    vi.useFakeTimers();
    cacheWrite("k", "value", 1_000);

    vi.advanceTimersByTime(1_001);
    expect(cacheRead("k")).toBeNull();
  });
});
