/**
 * Process-wide TTL cache with request coalescing.
 *
 * Two things matter here. Caching stops repeat requests for the same symbol
 * from each hitting the upstream API, and coalescing stops N concurrent
 * requests for the same key from becoming N upstream calls while the first is
 * still in flight. Without the second part, every client polling on the same
 * interval still produces one upstream call per client.
 *
 * This lives in module scope, so it is per server instance. That is enough for
 * a single-instance deployment; multiple instances would each keep their own
 * copy and want a shared store like Redis instead.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const MAX_ENTRIES = 1_000;

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const TTL = {
  /** Two years of daily bars; only the final bar moves during a session. */
  dailyHistory: 15 * 60_000,
  intradayHistory: 30_000,
  /** Short enough to feel live, long enough to absorb 1s client polling. */
  quote: 5_000,
  /** Minute bars for the 1D chart; matches the intraday history cadence. */
  chartIntraday: 30_000,
  /** 15-minute bars for the 7D chart, which only change four times an hour. */
  chartMultiDay: 5 * 60_000,
  /** Weekly bars for the 5Y chart; only the in-progress week moves. */
  chartWeekly: 30 * 60_000,
  quoteSummary: 10 * 60_000,
  search: 5 * 60_000,
  trending: 5 * 60_000,
  news: 5 * 60_000,
  /**
   * 13F filings land once a quarter. Six hours is short enough to pick up a
   * new drop without re-hitting EDGAR on every tab visit.
   */
  thirteenF: 6 * 60 * 60_000,
  thirteenFSearch: 30 * 60_000,
  /**
   * The sample scan every first-time visitor sees. Held long enough that the
   * full fan-out runs at most a handful of times an hour no matter how many
   * people land on the page.
   */
  demoScan: 10 * 60_000,
} as const;

function readFresh<T>(key: string): Entry<T> | null {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    // Keep it around briefly: it is still useful if the next load fails.
    return null;
  }

  // Re-insert to mark as recently used for the size-based eviction below.
  store.delete(key);
  store.set(key, entry);
  return entry;
}

export function cacheWrite<T>(key: string, value: T, ttlMs: number): void {
  store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + ttlMs });

  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

export function cacheRead<T>(key: string): T | null {
  const entry = readFresh<T>(key);
  return entry ? entry.value : null;
}

/**
 * Returns the cached value, the in-flight request for it, or starts a new load.
 * If the load fails but an expired value is still held, that stale value is
 * served instead of propagating the error.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  const fresh = readFresh<T>(key);
  if (fresh) return fresh.value;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const request = load()
    .then((value) => {
      cacheWrite(key, value, ttlMs);
      return value;
    })
    .catch((error: unknown) => {
      const stale = store.get(key) as Entry<T> | undefined;
      if (stale) return stale.value;
      throw error;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

/** Test seam. */
export function cacheClear(): void {
  store.clear();
  inflight.clear();
}

export function cacheStats() {
  return { entries: store.size, inflight: inflight.size };
}
