import { DEFAULT_SCAN_UNIVERSE } from "./constants";
import { TTL, cached } from "./cache";
import {
  fetchDailyHistory,
  fetchIntradayHistory,
  fetchQuote,
  fetchQuotes,
  mergeLiveQuoteIntoHistory,
} from "./market-data";
import { yahooFinance } from "./yahoo-client";
import {
  detectBreakout,
  findHistoricalBreakouts,
  findResistanceLevels,
  findSupportLevels,
  scoreBreakoutLikelihood,
} from "./technical";
import type { BreakoutCandidate } from "./types";
import { rankBreakoutCandidates } from "./ranking";

export async function getScanUniverse(
  extraSymbols: string[] = [],
  options?: { symbolsOnly?: boolean }
): Promise<string[]> {
  if (options?.symbolsOnly && extraSymbols.length > 0) {
    return [...new Set(extraSymbols.map((symbol) => symbol.toUpperCase()))];
  }

  const symbols = new Set<string>([
    ...DEFAULT_SCAN_UNIVERSE,
    ...extraSymbols.map((symbol) => symbol.toUpperCase()),
  ]);

  try {
    const trending = await cached("trending:US", TTL.trending, () =>
      yahooFinance.trendingSymbols("US", { count: 15 })
    );
    trending.quotes.forEach((quote) => {
      if (quote.symbol) symbols.add(quote.symbol.toUpperCase());
    });
  } catch {
    // Trending symbols are optional; fall back to default universe.
  }

  return [...symbols];
}

export async function scanStockForBreakout(
  symbol: string
): Promise<BreakoutCandidate | null> {
  const upperSymbol = symbol.toUpperCase();
  const lastUpdated = new Date().toISOString();

  try {
    const [dailyHistory, quote, intradayHistory] = await Promise.all([
      fetchDailyHistory(upperSymbol),
      fetchQuote(upperSymbol),
      fetchIntradayHistory(upperSymbol, "1m"),
    ]);

    const history = mergeLiveQuoteIntoHistory(dailyHistory, quote);

    if (history.length < 60) return null;

    const resistanceLevels = findResistanceLevels(history);
    const supportLevels = findSupportLevels(history);
    const pastBreakouts = findHistoricalBreakouts(history);
    const scoring = scoreBreakoutLikelihood(
      history,
      resistanceLevels,
      pastBreakouts
    );
    const breakout = detectBreakout(history, resistanceLevels, supportLevels);

    const liveIntraday =
      intradayHistory.length > 0
        ? [
            ...intradayHistory.slice(0, -1),
            {
              ...intradayHistory[intradayHistory.length - 1],
              close:
                quote.regularMarketPrice ??
                intradayHistory[intradayHistory.length - 1].close,
              date: lastUpdated,
            },
          ]
        : intradayHistory;

    return {
      symbol: upperSymbol,
      name: quote.shortName ?? quote.longName ?? upperSymbol,
      currentPrice: quote.regularMarketPrice ?? history[history.length - 1].close,
      changePercent: quote.regularMarketChangePercent ?? 0,
      likelihoodScore: scoring.score,
      nearestResistance: scoring.nearestResistance,
      distanceToResistance: scoring.distanceToResistance,
      historicalSuccessRate: scoring.historicalSuccessRate,
      pastBreakouts,
      history,
      intradayHistory: liveIntraday,
      resistanceLevels,
      breakout,
      marketState: quote.marketState ?? "UNKNOWN",
      lastUpdated,
    };
  } catch {
    return null;
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    const current = index++;
    if (current >= items.length) return;
    results[current] = await worker(items[current]);
    await runNext();
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runNext())
  );

  return results;
}

export async function scanForBreakouts(
  extraSymbols: string[] = [],
  minScore = 15,
  symbolsOnly = false
): Promise<{ scannedAt: string; candidates: BreakoutCandidate[] }> {
  const scannedAt = new Date().toISOString();
  const universe = await getScanUniverse(extraSymbols, { symbolsOnly });
  const effectiveMinScore =
    symbolsOnly && extraSymbols.length > 0 ? 0 : minScore;

  const candidates = await runWithConcurrency(universe, 4, (symbol) =>
    scanStockForBreakout(symbol)
  );

  return {
    scannedAt,
    candidates: rankBreakoutCandidates(
      candidates
        .filter((candidate): candidate is BreakoutCandidate => candidate !== null)
        .filter((candidate) => candidate.likelihoodScore >= effectiveMinScore)
    ),
  };
}

function quoteAsRecord(quote: unknown): Record<string, unknown> {
  return quote as Record<string, unknown>;
}

export function updateCandidateWithLiveQuote(
  candidate: BreakoutCandidate,
  quote: unknown
): BreakoutCandidate {
  const quoteData = quoteAsRecord(quote);
  const lastUpdated = new Date().toISOString();
  const price =
    (quoteData.regularMarketPrice as number | undefined) ?? candidate.currentPrice;

  const history = mergeLiveQuoteIntoHistory(candidate.history, quoteData);
  const supportLevels = findSupportLevels(history);
  const scoring = scoreBreakoutLikelihood(
    history,
    candidate.resistanceLevels,
    candidate.pastBreakouts
  );
  const breakout = detectBreakout(
    history,
    candidate.resistanceLevels,
    supportLevels
  );

  let intradayHistory = candidate.intradayHistory;
  if (intradayHistory.length > 0) {
    const lastBar = intradayHistory[intradayHistory.length - 1];
    intradayHistory = [
      ...intradayHistory.slice(0, -1),
      {
        ...lastBar,
        close: price,
        high: Math.max(lastBar.high, price),
        low: Math.min(lastBar.low, price),
        date: lastUpdated,
      },
    ];
  }

  return {
    ...candidate,
    currentPrice: price,
    changePercent:
      (quoteData.regularMarketChangePercent as number | undefined) ??
      candidate.changePercent,
    likelihoodScore: scoring.score,
    nearestResistance: scoring.nearestResistance,
    distanceToResistance: scoring.distanceToResistance,
    historicalSuccessRate: scoring.historicalSuccessRate,
    history,
    intradayHistory,
    breakout,
    marketState: (quoteData.marketState as string | undefined) ?? candidate.marketState,
    lastUpdated,
  };
}

export async function refreshCandidatesLive(
  candidates: BreakoutCandidate[]
): Promise<{ updatedAt: string; candidates: BreakoutCandidate[] }> {
  if (candidates.length === 0) {
    return { updatedAt: new Date().toISOString(), candidates: [] };
  }

  const symbols = candidates.map((candidate) => candidate.symbol);
  const quoteBySymbol = await fetchQuotes(symbols);

  const updated = candidates.map((candidate) => {
    const quote = quoteBySymbol.get(candidate.symbol);
    return quote ? updateCandidateWithLiveQuote(candidate, quote) : candidate;
  });

  return {
    updatedAt: new Date().toISOString(),
    candidates: rankBreakoutCandidates(updated),
  };
}
