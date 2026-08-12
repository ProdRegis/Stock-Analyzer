import { yahooFinance } from "./yahoo-client";
import { TTL, cacheRead, cacheWrite, cached } from "./cache";
import type { MarketCompanyDetails, MarketSearchResult, PricePoint } from "./types";

async function loadQuote(symbol: string) {
  return yahooFinance.quote(symbol);
}

export type MarketQuote = Awaited<ReturnType<typeof loadQuote>>;

const quoteKey = (symbol: string) => `quote:${symbol}`;

/** Live quote for one symbol, shared across every caller in this process. */
export async function fetchQuote(symbol: string): Promise<MarketQuote> {
  const upper = symbol.toUpperCase();
  return cached(quoteKey(upper), TTL.quote, () => loadQuote(upper));
}

/**
 * Batched quote lookup sharing one cache with fetchQuote.
 *
 * Symbols already cached cost nothing, the remainder go out as a single
 * upstream request, and identical concurrent batches are coalesced. This is
 * what keeps one-second client polling from becoming one upstream call per
 * client per second.
 */
export async function fetchQuotes(
  symbols: string[]
): Promise<Map<string, MarketQuote>> {
  const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const resolved = new Map<string, MarketQuote>();
  const missing: string[] = [];

  for (const symbol of unique) {
    const hit = cacheRead<MarketQuote>(quoteKey(symbol));
    if (hit) resolved.set(symbol, hit);
    else missing.push(symbol);
  }

  if (missing.length === 0) return resolved;

  const batch = await cached(
    `quotes:${missing.join(",")}`,
    TTL.quote,
    async () => {
      const result = await yahooFinance.quote(missing);
      return (Array.isArray(result) ? result : [result]) as MarketQuote[];
    }
  );

  for (const quote of batch) {
    const symbol = (quote as { symbol?: string }).symbol?.toUpperCase();
    if (!symbol) continue;
    cacheWrite(quoteKey(symbol), quote, TTL.quote);
    resolved.set(symbol, quote);
  }

  return resolved;
}


type RawQuote = {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjclose?: number | null;
  volume: number | null;
};

function effectiveClose(quote: RawQuote): number | null {
  return quote.adjclose ?? quote.close;
}

function normalizeDailyHistory(quotes: RawQuote[]): PricePoint[] {
  return quotes
    .filter((quote) => {
      const close = effectiveClose(quote);
      return (
        quote.open != null &&
        quote.high != null &&
        quote.low != null &&
        close != null &&
        quote.volume != null
      );
    })
    .map((quote) => {
      const close = effectiveClose(quote)!;
      return {
        date: quote.date.toISOString().split("T")[0],
        open: quote.open!,
        high: quote.high!,
        low: quote.low!,
        close,
        volume: quote.volume!,
      };
    });
}

function normalizeIntradayHistory(quotes: RawQuote[]): PricePoint[] {
  return quotes
    .filter(
      (quote) =>
        quote.open != null &&
        quote.high != null &&
        quote.low != null &&
        quote.close != null &&
        quote.volume != null
    )
    .map((quote) => ({
      date: quote.date.toISOString(),
      open: quote.open!,
      high: quote.high!,
      low: quote.low!,
      close: quote.close!,
      volume: quote.volume!,
    }));
}

function twoYearsAgo(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 2);
  return date;
}

function todayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

export function mergeLiveQuoteIntoHistory(
  history: PricePoint[],
  quote: Record<string, unknown>
): PricePoint[] {
  if (history.length === 0) return history;

  const price =
    (quote.regularMarketPrice as number | undefined) ??
    history[history.length - 1].close;
  const today = todayDateString();
  const last = history[history.length - 1];

  if (last.date === today) {
    return [
      ...history.slice(0, -1),
      {
        ...last,
        close: price,
        high: Math.max(
          last.high,
          (quote.regularMarketDayHigh as number | undefined) ?? price
        ),
        low: Math.min(
          last.low,
          (quote.regularMarketDayLow as number | undefined) ?? price
        ),
        volume:
          (quote.regularMarketVolume as number | undefined) ?? last.volume,
      },
    ];
  }

  return [
    ...history,
    {
      date: today,
      open: (quote.regularMarketOpen as number | undefined) ?? price,
      high: (quote.regularMarketDayHigh as number | undefined) ?? price,
      low: (quote.regularMarketDayLow as number | undefined) ?? price,
      close: price,
      volume: (quote.regularMarketVolume as number | undefined) ?? 0,
    },
  ];
}

export async function fetchDailyHistory(symbol: string): Promise<PricePoint[]> {
  const upper = symbol.toUpperCase();

  return cached(`daily:${upper}`, TTL.dailyHistory, async () => {
    const result = await yahooFinance.chart(upper, {
      period1: twoYearsAgo(),
      interval: "1d",
    });

    return normalizeDailyHistory(result.quotes as RawQuote[]);
  });
}

export async function fetchIntradayHistory(
  symbol: string,
  interval: "1m" | "5m" = "1m"
): Promise<PricePoint[]> {
  const upper = symbol.toUpperCase();

  return cached(`intraday:${upper}:${interval}`, TTL.intradayHistory, async () => {
    const period1 =
      interval === "1m"
        ? new Date(Date.now() - 24 * 60 * 60 * 1000)
        : new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    const result = await yahooFinance.chart(upper, {
      period1,
      interval,
    });

    return normalizeIntradayHistory(result.quotes);
  });
}

export async function searchMarket(query: string): Promise<MarketSearchResult[]> {
  const trimmed = query.trim();

  return cached(`search:${trimmed.toLowerCase()}`, TTL.search, () =>
    rankSearchResults(trimmed)
  );
}

async function rankSearchResults(
  trimmed: string
): Promise<MarketSearchResult[]> {
  const result = await yahooFinance.search(trimmed, {
    quotesCount: 10,
    newsCount: 0,
  });

  const upperQuery = trimmed.toUpperCase();
  const lowerQuery = trimmed.toLowerCase();

  function rankResult(item: {
    symbol: string;
    name: string;
    type: string;
    quoteType: string;
  }): number {
    const sym = item.symbol.toUpperCase();
    const name = item.name.toLowerCase();

    if (sym === upperQuery) return 0;
    if (name === lowerQuery) return 1;
    if (name.startsWith(lowerQuery)) return 2;
    if (name.includes(lowerQuery)) return 3;
    if (sym.startsWith(upperQuery)) return 4;
    if (/equity/i.test(item.type) || item.quoteType === "EQUITY") return 5;
    return 6;
  }

  return (result.quotes ?? [])
    .filter((item) => typeof item.symbol === "string" && item.symbol.length > 0)
    .map((item) => ({
      symbol: String(item.symbol).toUpperCase(),
      name: String(item.shortname ?? item.longname ?? item.symbol),
      exchange: String(item.exchDisp ?? item.exchange ?? "—"),
      type: String(item.typeDisp ?? item.quoteType ?? "Security"),
      quoteType: String(item.quoteType ?? ""),
    }))
    .sort((a, b) => rankResult(a) - rankResult(b))
    .slice(0, 8)
    .map(({ quoteType: _quoteType, ...item }) => item);
}

export async function fetchCompanyDetails(
  symbol: string
): Promise<MarketCompanyDetails> {
  const upperSymbol = symbol.toUpperCase();

  const [quote, summary, intradayHistory] = await Promise.all([
    fetchQuote(upperSymbol),
    cached(`summary:${upperSymbol}:profile`, TTL.quoteSummary, () =>
      yahooFinance.quoteSummary(upperSymbol, {
        modules: ["summaryProfile", "summaryDetail", "price"],
      })
    ),
    fetchIntradayHistory(upperSymbol, "1m"),
  ]);

  const profile = summary.summaryProfile;
  const detail = summary.summaryDetail;

  return {
    symbol: upperSymbol,
    name: quote.shortName ?? quote.longName ?? upperSymbol,
    currentPrice: quote.regularMarketPrice ?? 0,
    change: quote.regularMarketChange ?? 0,
    changePercent: quote.regularMarketChangePercent ?? 0,
    currency: quote.currency ?? "USD",
    marketState: quote.marketState ?? "UNKNOWN",
    marketTime: quote.regularMarketTime?.toISOString() ?? null,
    dayHigh: quote.regularMarketDayHigh ?? null,
    dayLow: quote.regularMarketDayLow ?? null,
    volume: quote.regularMarketVolume ?? null,
    previousClose: quote.regularMarketPreviousClose ?? null,
    open: quote.regularMarketOpen ?? null,
    marketCap: detail?.marketCap ?? null,
    peRatio: detail?.trailingPE ?? null,
    fiftyTwoWeekHigh: detail?.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: detail?.fiftyTwoWeekLow ?? null,
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
    website: profile?.website ?? null,
    summary: profile?.longBusinessSummary ?? null,
    intradayHistory,
  };
}
