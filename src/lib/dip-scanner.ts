import {
  buildLongSellReasons,
  buildShortSellReasons,
  buyTimingToDays,
  fetchSymbolMarketContext,
  formatDateLabel,
} from "./dip-sell-reasons";
import { getScanUniverse } from "./breakout-scanner";
import {
  fetchDailyHistory,
  fetchIntradayHistory,
  fetchQuote,
  fetchQuotes,
  mergeLiveQuoteIntoHistory,
} from "./market-data";
import {
  findHistoricalDipRecoveries,
  findResistanceLevels,
  findSupportLevels,
  computeLongStopLoss,
  computeShortStopLoss,
  scoreLongDipOpportunity,
  scoreShortOpportunity,
} from "./technical";
import type { PricePoint } from "./types";
import type {
  BuyTimingWindow,
  DipCandidate,
  DipSensitivity,
  PastDipRecovery,
  ResistanceLevel,
  StopLossReasonDetail,
  SymbolMarketContext,
} from "./types";
import { rankDipCandidates } from "./ranking";
import { attachBusinessQuality } from "./business-quality";

function addTradingDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;

  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }

  return result;
}

function predictLongSell(
  scoring: ReturnType<typeof scoreLongDipOpportunity>,
  buyTiming: BuyTimingWindow,
  recoveryDays: number,
  nearestResistance: ResistanceLevel | null,
  nearestSupport: ResistanceLevel | null,
  currentPrice: number,
  pastDips: PastDipRecovery[],
  context: SymbolMarketContext
): {
  sellTiming: BuyTimingWindow;
  sellTimingLabel: string;
  predictedSellDate: string;
  predictedSellLabel: string;
  sellTargetPrice: number | null;
  sellReason: string;
  sellPredictionReason: string;
  sellReasons: ReturnType<typeof buildLongSellReasons>;
} {
  const buyDays = buyTimingToDays(buyTiming);
  const positiveDips = pastDips.filter((dip) => dip.gain10d > 0);
  const avgGain =
    positiveDips.length > 0
      ? positiveDips.reduce((sum, dip) => sum + dip.gain10d, 0) / positiveDips.length
      : 0.06;

  const holdDays = Math.max(3, Math.round(recoveryDays + 2));
  const sellDaysFromToday = buyDays + holdDays;

  const resistanceTarget = nearestResistance?.price ?? null;
  const gainTarget = currentPrice * (1 + avgGain);
  const sellTargetPrice =
    resistanceTarget && resistanceTarget > currentPrice
      ? Math.min(resistanceTarget, gainTarget * 1.15)
      : gainTarget;

  const gainPct = ((sellTargetPrice - currentPrice) / currentPrice) * 100;
  const sellDate = addTradingDays(new Date(), sellDaysFromToday);
  const sellDateLabel = formatDateLabel(sellDate);

  let sellTiming: BuyTimingWindow = "this_week";
  if (sellDaysFromToday <= 3) sellTiming = "2-3_days";
  else if (sellDaysFromToday <= 7) sellTiming = "this_week";
  else if (sellDaysFromToday <= 14) sellTiming = "1-2_weeks";
  else sellTiming = "wait";

  const sellTimingLabel =
    resistanceTarget && resistanceTarget > currentPrice
      ? `Sell near $${sellTargetPrice.toFixed(2)} (~${gainPct.toFixed(0)}% target)`
      : `Take profit in ~${holdDays} days at ~$${sellTargetPrice.toFixed(2)}`;

  const sellReasons = buildLongSellReasons({
    direction: "long",
    currentPrice,
    rsi: scoring.rsi,
    buyTiming,
    buyDays,
    holdDays,
    sellDaysFromToday,
    sellTargetPrice,
    gainPct,
    sellDateLabel,
    nearestResistance,
    nearestSupport,
    avgRecoveryDays: scoring.avgRecoveryDays,
    historicalRecoveryRate: scoring.historicalRecoveryRate,
    pastDips,
    context,
  });

  const sellReason = sellReasons
    .slice(0, 2)
    .map((reason) => reason.detail)
    .join(" ");

  const sellPredictionReason = sellReasons
    .filter((reason) =>
      ["calculation", "prediction", "technical"].includes(reason.category)
    )
    .map((reason) => `${reason.title}: ${reason.detail}`)
    .join(" ");

  return {
    sellTiming,
    sellTimingLabel,
    predictedSellDate: sellDate.toISOString(),
    predictedSellLabel: `Target sell by ${sellDateLabel}`,
    sellTargetPrice,
    sellReason,
    sellPredictionReason,
    sellReasons,
  };
}

function predictShortCover(
  scoring: ReturnType<typeof scoreShortOpportunity>,
  entryDays: number,
  context: SymbolMarketContext
): {
  sellTiming: BuyTimingWindow;
  sellTimingLabel: string;
  predictedSellDate: string;
  predictedSellLabel: string;
  sellTargetPrice: number | null;
  sellReason: string;
  sellPredictionReason: string;
  sellReasons: ReturnType<typeof buildShortSellReasons>;
} {
  const { nearestSupport, nearestResistance, rsi, dipPercent, distanceToSupport } =
    scoring;
  const belowSupport = nearestSupport !== null && distanceToSupport < 0;
  const coverDays = entryDays + Math.max(2, Math.round(entryDays * 0.8));
  const coverDate = addTradingDays(new Date(), coverDays);
  const coverDateLabel = formatDateLabel(coverDate);
  const coverPrice = nearestSupport?.price ?? null;

  let sellTiming: BuyTimingWindow = "2-3_days";
  if (coverDays <= 3) sellTiming = "2-3_days";
  else if (coverDays <= 7) sellTiming = "this_week";
  else sellTiming = "1-2_weeks";

  const sellTimingLabel = coverPrice
    ? `Cover near $${coverPrice.toFixed(2)} support`
    : `Cover when RSI drops below 35 (~${coverDays} days)`;

  const sellReasons = buildShortSellReasons({
    direction: "short",
    rsi,
    coverDays,
    coverDateLabel,
    coverPrice,
    nearestSupport,
    nearestResistance,
    dipPercent,
    belowSupport,
    context,
  });

  const sellReason = sellReasons
    .slice(0, 2)
    .map((reason) => reason.detail)
    .join(" ");

  const sellPredictionReason = sellReasons
    .filter((reason) =>
      ["calculation", "prediction", "technical"].includes(reason.category)
    )
    .map((reason) => `${reason.title}: ${reason.detail}`)
    .join(" ");

  return {
    sellTiming,
    sellTimingLabel,
    predictedSellDate: coverDate.toISOString(),
    predictedSellLabel: `Target cover by ${coverDateLabel}`,
    sellTargetPrice: coverPrice,
    sellReason,
    sellPredictionReason,
    sellReasons,
  };
}

function predictLongTiming(
  scoring: ReturnType<typeof scoreLongDipOpportunity>,
  nearestResistance: ResistanceLevel | null,
  nearestSupport: ResistanceLevel | null,
  currentPrice: number,
  pastDips: PastDipRecovery[],
  context: SymbolMarketContext,
  history: PricePoint[]
): {
  buyTiming: BuyTimingWindow;
  buyTimingLabel: string;
  predictedRecoveryDate: string;
  predictedRecoveryLabel: string;
  buyReason: string;
  predictionReason: string;
  sellTiming: BuyTimingWindow;
  sellTimingLabel: string;
  predictedSellDate: string;
  predictedSellLabel: string;
  sellTargetPrice: number | null;
  sellReason: string;
  sellPredictionReason: string;
  sellReasons: ReturnType<typeof buildLongSellReasons>;
  stopLossPrice: number;
  stopLossPercent: number;
  stopLossLabel: string;
  stopLossReason: string;
  stopLossCalculation: string;
  stopLossReasons: StopLossReasonDetail[];
  stopLossWinningMethod: string;
} {
  const { rsi, distanceToSupport, avgRecoveryDays, historicalRecoveryRate, dipPercent } =
    scoring;

  let buyTiming: BuyTimingWindow = "this_week";
  let recoveryDays = Math.max(1, Math.round(avgRecoveryDays));

  if (rsi <= 30 && nearestSupport && distanceToSupport <= 3) {
    buyTiming = "now";
    recoveryDays = Math.min(recoveryDays, 2);
  } else if (rsi <= 35 && dipPercent >= 8) {
    buyTiming = "tomorrow";
    recoveryDays = Math.min(recoveryDays, 3);
  } else if (avgRecoveryDays <= 4) {
    buyTiming = "2-3_days";
    recoveryDays = Math.min(recoveryDays, 5);
  } else if (avgRecoveryDays <= 7) {
    buyTiming = "this_week";
    recoveryDays = Math.min(recoveryDays, 7);
  } else if (historicalRecoveryRate < 0.4) {
    buyTiming = "wait";
    recoveryDays = Math.max(recoveryDays, 10);
  } else {
    buyTiming = "1-2_weeks";
    recoveryDays = Math.max(recoveryDays, 8);
  }

  const buyTimingLabels: Record<BuyTimingWindow, string> = {
    now: "Buy today — oversold at support",
    tomorrow: "Buy tomorrow — dip likely near a bottom",
    "2-3_days": "Buy in 2–3 days — wait for stabilization",
    this_week: "Buy this week — recovery building",
    "1-2_weeks": "Buy within 1–2 weeks — deeper correction",
    wait: "Wait — weak historical recovery pattern",
  };

  const recoveryDate = addTradingDays(new Date(), recoveryDays);

  const buyReason =
    buyTiming === "now"
      ? `RSI ${rsi.toFixed(0)} with price near support ($${nearestSupport?.price.toFixed(2) ?? "N/A"}) after a ${dipPercent.toFixed(1)}% dip.`
      : buyTiming === "wait"
        ? `Historical recovery rate is only ${(historicalRecoveryRate * 100).toFixed(0)}% for similar dips on this stock.`
        : `${dipPercent.toFixed(1)}% dip with RSI ${rsi.toFixed(0)}; past dips recovered in ~${avgRecoveryDays.toFixed(0)} days on average.`;

  const predictionReason = `Based on ${scoring.historicalRecoveryRate > 0 ? `${(historicalRecoveryRate * 100).toFixed(0)}% historical recovery rate` : "category averages"} and average ${avgRecoveryDays.toFixed(0)}-day recovery from similar dips. RSI and support proximity adjust the window.`;

  const sellPlan = predictLongSell(
    scoring,
    buyTiming,
    recoveryDays,
    nearestResistance,
    nearestSupport,
    currentPrice,
    pastDips,
    context
  );

  const stopPlan = computeLongStopLoss(
    currentPrice,
    nearestSupport,
    history,
    pastDips
  );

  return {
    buyTiming,
    buyTimingLabel: buyTimingLabels[buyTiming],
    predictedRecoveryDate: recoveryDate.toISOString(),
    predictedRecoveryLabel: `Expected bounce by ${formatDateLabel(recoveryDate)}`,
    buyReason,
    predictionReason,
    ...sellPlan,
    ...stopPlan,
  };
}

function predictShortTiming(
  scoring: ReturnType<typeof scoreShortOpportunity>,
  context: SymbolMarketContext,
  currentPrice: number,
  history: PricePoint[],
  pastDips: PastDipRecovery[] = []
): {
  buyTiming: BuyTimingWindow;
  buyTimingLabel: string;
  predictedRecoveryDate: string;
  predictedRecoveryLabel: string;
  buyReason: string;
  predictionReason: string;
  sellTiming: BuyTimingWindow;
  sellTimingLabel: string;
  predictedSellDate: string;
  predictedSellLabel: string;
  sellTargetPrice: number | null;
  sellReason: string;
  sellPredictionReason: string;
  sellReasons: ReturnType<typeof buildShortSellReasons>;
  stopLossPrice: number;
  stopLossPercent: number;
  stopLossLabel: string;
  stopLossReason: string;
  stopLossCalculation: string;
  stopLossReasons: StopLossReasonDetail[];
  stopLossWinningMethod: string;
} {
  const { rsi, nearestSupport, dipPercent } = scoring;
  const belowSupport =
    nearestSupport !== null && scoring.distanceToSupport < 0;

  let buyTiming: BuyTimingWindow = "now";
  let declineDays = 3;

  if (belowSupport && rsi < 40) {
    buyTiming = "now";
    declineDays = 2;
  } else if (rsi > 70) {
    buyTiming = "tomorrow";
    declineDays = 4;
  } else {
    buyTiming = "2-3_days";
    declineDays = 5;
  }

  const targetDate = addTradingDays(new Date(), declineDays);
  const coverPlan = predictShortCover(scoring, declineDays, context);
  const stopPlan = computeShortStopLoss(
    currentPrice,
    scoring.nearestResistance,
    history,
    pastDips
  );

  return {
    buyTiming,
    buyTimingLabel:
      buyTiming === "now"
        ? "Short today — breakdown confirmed"
        : buyTiming === "tomorrow"
          ? "Short tomorrow — overextended, pullback due"
          : "Short in 2–3 days — wait for failed bounce",
    predictedRecoveryDate: targetDate.toISOString(),
    predictedRecoveryLabel: `Expected further downside by ${formatDateLabel(targetDate)}`,
    buyReason: belowSupport
      ? `Price broke below support at $${nearestSupport?.price.toFixed(2)} with RSI ${rsi.toFixed(0)} — downtrend continuation likely.`
      : `Stock is ${dipPercent.toFixed(1)}% above long-term average with RSI ${rsi.toFixed(0)} — pullback setup for shorts.`,
    predictionReason: `Short thesis uses support breakdown, RSI (${rsi.toFixed(0)}), and distance from moving averages. Estimated ${declineDays}-day window for follow-through.`,
    ...coverPlan,
    ...stopPlan,
  };
}

export interface DipThresholds {
  /** Minimum recovery score for a long to qualify. */
  longScore: number;
  /** Minimum drop from the recent high, in percent. */
  longDipPercent: number;
  /** Minimum score for a short setup to qualify. */
  shortScore: number;
}

/**
 * How much has to be wrong with a stock before it counts as a setup.
 *
 * On a quiet day almost nothing clears the strict bar, which is correct but
 * looks like a broken scanner. Exposing the bar lets someone widen it and see
 * the weaker setups, with the tradeoff stated rather than hidden.
 */
export const DIP_SENSITIVITY: Record<DipSensitivity, DipThresholds> = {
  strict: { longScore: 35, longDipPercent: 6, shortScore: 40 },
  balanced: { longScore: 20, longDipPercent: 3, shortScore: 25 },
  broad: { longScore: 10, longDipPercent: 1.5, shortScore: 15 },
};

export async function scanStockForDip(
  symbol: string,
  thresholds: DipThresholds = DIP_SENSITIVITY.balanced
): Promise<DipCandidate[]> {
  const upperSymbol = symbol.toUpperCase();
  const lastUpdated = new Date().toISOString();

  try {
    const [dailyHistory, quote, intradayHistory, marketContext] = await Promise.all([
      fetchDailyHistory(upperSymbol),
      fetchQuote(upperSymbol),
      fetchIntradayHistory(upperSymbol, "1m"),
      fetchSymbolMarketContext(upperSymbol),
    ]);

    const history = mergeLiveQuoteIntoHistory(dailyHistory, quote);
    if (history.length < 60) return [];

    const supportLevels = findSupportLevels(history);
    const resistanceLevels = findResistanceLevels(history);
    const pastDips = findHistoricalDipRecoveries(history);

    const longScoring = scoreLongDipOpportunity(history, supportLevels, pastDips);
    const shortScoring = scoreShortOpportunity(
      history,
      resistanceLevels,
      supportLevels
    );

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

    const base = {
      symbol: upperSymbol,
      name: quote.shortName ?? quote.longName ?? upperSymbol,
      currentPrice:
        quote.regularMarketPrice ?? history[history.length - 1].close,
      changePercent: quote.regularMarketChangePercent ?? 0,
      history,
      intradayHistory: liveIntraday,
      supportLevels,
      resistanceLevels,
      pastDips,
      marketState: quote.marketState ?? "UNKNOWN",
      lastUpdated,
    };

    const candidates: DipCandidate[] = [];

    if (
      longScoring.score >= thresholds.longScore &&
      longScoring.dipPercent >= thresholds.longDipPercent
    ) {
      const nearestResistance =
        resistanceLevels
          .filter((level) => level.price >= base.currentPrice * 0.98)
          .sort((a, b) => a.price - b.price)[0] ?? null;
      const timing = predictLongTiming(
        longScoring,
        nearestResistance,
        longScoring.nearestSupport,
        base.currentPrice,
        pastDips,
        marketContext,
        history
      );
      candidates.push({
        ...base,
        direction: "long",
        dipPercent: longScoring.dipPercent,
        recoveryScore: longScoring.score,
        rsi: longScoring.rsi,
        nearestSupport: longScoring.nearestSupport,
        nearestResistance,
        distanceToSupport: longScoring.distanceToSupport,
        historicalRecoveryRate: longScoring.historicalRecoveryRate,
        avgRecoveryDays: longScoring.avgRecoveryDays,
        marketContext,
        ...timing,
      });
    }

    if (shortScoring.score >= thresholds.shortScore) {
      const timing = predictShortTiming(
        shortScoring,
        marketContext,
        base.currentPrice,
        history,
        pastDips
      );
      candidates.push({
        ...base,
        direction: "short",
        dipPercent: shortScoring.dipPercent,
        recoveryScore: shortScoring.score,
        rsi: shortScoring.rsi,
        nearestSupport: shortScoring.nearestSupport,
        nearestResistance: shortScoring.nearestResistance,
        distanceToSupport: shortScoring.distanceToSupport,
        historicalRecoveryRate: 0,
        avgRecoveryDays: 0,
        marketContext,
        ...timing,
      });
    }

    return candidates;
  } catch {
    return [];
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

export async function scanForDips(
  extraSymbols: string[] = [],
  sensitivity: DipSensitivity = "balanced",
  symbolsOnly = false
): Promise<{
  scannedAt: string;
  scanned: number;
  sensitivity: DipSensitivity;
  candidates: DipCandidate[];
}> {
  const scannedAt = new Date().toISOString();
  const universe = await getScanUniverse(extraSymbols, { symbolsOnly });

  // Someone who typed a ticker wants to see that stock's read, not be told it
  // failed a screen they never chose, so an explicit lookup uses the widest bar.
  const singleLookup = symbolsOnly && extraSymbols.length > 0;
  const thresholds = singleLookup
    ? DIP_SENSITIVITY.broad
    : DIP_SENSITIVITY[sensitivity];

  const nested = await runWithConcurrency(universe, 6, (symbol) =>
    scanStockForDip(symbol, thresholds)
  );

  // Both directions share one score field, so the floor is the lower bar;
  // each direction was already screened on its own threshold above.
  const scoreFloor = singleLookup
    ? 0
    : Math.min(thresholds.longScore, thresholds.shortScore);

  const candidates = rankDipCandidates(
    nested.flat().filter((candidate) => candidate.recoveryScore >= scoreFloor)
  );

  return {
    scannedAt,
    scanned: universe.length,
    sensitivity: singleLookup ? "broad" : sensitivity,
    candidates: rankDipCandidates(await attachBusinessQuality(candidates)),
  };
}

function quoteAsRecord(quote: unknown): Record<string, unknown> {
  return quote as Record<string, unknown>;
}

export function updateDipCandidateWithLiveQuote(
  candidate: DipCandidate,
  quote: unknown
): DipCandidate {
  const quoteData = quoteAsRecord(quote);
  const lastUpdated = new Date().toISOString();
  const price =
    (quoteData.regularMarketPrice as number | undefined) ?? candidate.currentPrice;

  const history = mergeLiveQuoteIntoHistory(candidate.history, quoteData);
  const supportLevels = findSupportLevels(history);
  const resistanceLevels = findResistanceLevels(history);

  let updated = { ...candidate, history, supportLevels, resistanceLevels, lastUpdated };

  if (candidate.direction === "long") {
    const scoring = scoreLongDipOpportunity(
      history,
      supportLevels,
      candidate.pastDips
    );
    const nearestResistance =
      resistanceLevels
        .filter((level) => level.price >= price * 0.98)
        .sort((a, b) => a.price - b.price)[0] ?? null;
    const timing = predictLongTiming(
      scoring,
      nearestResistance,
      scoring.nearestSupport,
      price,
      candidate.pastDips,
      candidate.marketContext,
      history
    );
    updated = {
      ...updated,
      currentPrice: price,
      changePercent:
        (quoteData.regularMarketChangePercent as number | undefined) ??
        candidate.changePercent,
      dipPercent: scoring.dipPercent,
      recoveryScore: scoring.score,
      rsi: scoring.rsi,
      nearestSupport: scoring.nearestSupport,
      nearestResistance,
      distanceToSupport: scoring.distanceToSupport,
      historicalRecoveryRate: scoring.historicalRecoveryRate,
      avgRecoveryDays: scoring.avgRecoveryDays,
      ...timing,
    };
  } else {
    const scoring = scoreShortOpportunity(
      history,
      resistanceLevels,
      supportLevels
    );
    const timing = predictShortTiming(
      scoring,
      candidate.marketContext,
      price,
      history,
      candidate.pastDips
    );
    updated = {
      ...updated,
      currentPrice: price,
      changePercent:
        (quoteData.regularMarketChangePercent as number | undefined) ??
        candidate.changePercent,
      dipPercent: scoring.dipPercent,
      recoveryScore: scoring.score,
      rsi: scoring.rsi,
      nearestSupport: scoring.nearestSupport,
      nearestResistance: scoring.nearestResistance,
      distanceToSupport: scoring.distanceToSupport,
      ...timing,
    };
  }

  if (candidate.intradayHistory.length > 0) {
    const lastBar = candidate.intradayHistory[candidate.intradayHistory.length - 1];
    updated.intradayHistory = [
      ...candidate.intradayHistory.slice(0, -1),
      {
        ...lastBar,
        close: price,
        high: Math.max(lastBar.high, price),
        low: Math.min(lastBar.low, price),
        date: lastUpdated,
      },
    ];
  }

  updated.marketState =
    (quoteData.marketState as string | undefined) ?? candidate.marketState;

  return updated;
}

export async function refreshDipCandidatesLive(
  candidates: DipCandidate[]
): Promise<{ updatedAt: string; candidates: DipCandidate[] }> {
  if (candidates.length === 0) {
    return { updatedAt: new Date().toISOString(), candidates: [] };
  }

  const symbols = [...new Set(candidates.map((candidate) => candidate.symbol))];
  const quoteBySymbol = await fetchQuotes(symbols);

  const updated = candidates.map((candidate) => {
    const quote = quoteBySymbol.get(candidate.symbol);
    return quote ? updateDipCandidateWithLiveQuote(candidate, quote) : candidate;
  });

  return {
    updatedAt: new Date().toISOString(),
    candidates: rankDipCandidates(updated),
  };
}
