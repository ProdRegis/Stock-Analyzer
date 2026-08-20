import { TTL, cached } from "./cache";
import { searchMarket } from "./market-data";
import type { MarketSearchResult } from "./types";

const LEGAL_SUFFIX =
  /\b(INC|INCORPORATED|CORP|CORPORATION|LTD|LIMITED|PLC|CO|COMPANY|HOLDINGS|HOLDING|GROUP|THE|CLASS|CL|COM|COMMON|ORD|ORDINARY|SHS|SHARES|ADR|ADS|LP|LLP|LLC)\b/g;

export function normalizeIssuer(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(needle: string, haystack: string): number {
  const tokens = needle.split(" ").filter((token) => token.length > 2);
  if (tokens.length === 0) return haystack.includes(needle) ? 1 : 0;
  return tokens.filter((token) => haystack.includes(token)).length;
}

/**
 * Pick a Yahoo equity ticker for a 13F issuer name. Requires some overlap
 * with the issuer so "UNKNOWN ISSUER" does not map to a random large cap.
 */
export function pickBestTicker(
  issuer: string,
  hits: MarketSearchResult[]
): string | null {
  const needle = normalizeIssuer(issuer);
  if (!needle || hits.length === 0) return null;

  const scored = hits
    .map((hit) => {
      const name = normalizeIssuer(hit.name);
      const overlap = tokenOverlap(needle, name);
      let score = 0;
      if (/equity|stock/i.test(hit.type)) score += 4;
      if (name === needle) score += 10;
      else if (name.startsWith(needle) || needle.startsWith(name)) score += 6;
      else if (overlap > 0) score += overlap * 2;
      return { symbol: hit.symbol, score, overlap };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || (best.overlap === 0 && best.score < 10)) return null;
  if (best.score < 6) return null;
  return best.symbol;
}

export async function tickerForIssuer(
  cusip: string,
  issuer: string
): Promise<string | null> {
  const key = cusip.replace(/\s/g, "").toUpperCase();
  if (key.length < 6) return null;

  return cached(`cusip-ticker:${key}`, TTL.cusipTicker, async () => {
    const query = normalizeIssuer(issuer) || issuer;
    if (query.length < 3) return null;
    try {
      const hits = await searchMarket(query);
      return pickBestTicker(issuer, hits);
    } catch {
      return null;
    }
  });
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

export async function resolveTickers(
  rows: Array<{ cusip: string; issuer: string }>
): Promise<Map<string, string | null>> {
  const unique = new Map<string, string>();
  for (const row of rows) {
    const cusip = row.cusip.replace(/\s/g, "").toUpperCase();
    if (cusip.length < 6 || unique.has(cusip)) continue;
    unique.set(cusip, row.issuer);
  }

  const entries = [...unique.entries()];
  const resolved = await mapPool(entries, 6, ([cusip, issuer]) =>
    tickerForIssuer(cusip, issuer)
  );

  const map = new Map<string, string | null>();
  entries.forEach(([cusip], index) => {
    map.set(cusip, resolved[index] ?? null);
  });
  return map;
}
