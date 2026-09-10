import { fetchQuote } from "./market-data";

const CACHE_TTL_MS = 60 * 60 * 1000;
const RATE_SYMBOLS = ["^IRX", "^FVX", "^TNX"] as const;

let cachedRate: { rate: number; source: string; fetchedAt: number } | null = null;

export async function fetchRiskFreeRate(): Promise<{
  rate: number;
  source: string;
}> {
  if (cachedRate && Date.now() - cachedRate.fetchedAt < CACHE_TTL_MS) {
    return { rate: cachedRate.rate, source: cachedRate.source };
  }

  for (const symbol of RATE_SYMBOLS) {
    try {
      const quote = await fetchQuote(symbol);
      const yieldPercent = quote.regularMarketPrice;

      if (
        yieldPercent != null &&
        Number.isFinite(yieldPercent) &&
        yieldPercent > 0 &&
        yieldPercent < 25
      ) {
        const rate = yieldPercent / 100;
        cachedRate = {
          rate,
          source: `${symbol} (${yieldPercent.toFixed(2)}%)`,
          fetchedAt: Date.now(),
        };
        return { rate, source: cachedRate.source };
      }
    } catch {
      // Try next Treasury proxy.
    }
  }

  cachedRate = {
    rate: 0.043,
    source: "fallback 4.3% annualized",
    fetchedAt: Date.now(),
  };

  return { rate: cachedRate.rate, source: cachedRate.source };
}
