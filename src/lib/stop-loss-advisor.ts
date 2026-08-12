import {
  fetchDailyHistory,
  fetchQuote,
  mergeLiveQuoteIntoHistory,
} from "./market-data";
import {
  computeLongStopLoss,
  computeShortStopLoss,
  findHistoricalDipRecoveries,
  findResistanceLevels,
  findSupportLevels,
  scoreLongDipOpportunity,
  scoreShortOpportunity,
} from "./technical";
import type { StopLossRecommendation, TradeDirection } from "./types";

export interface AdviseStopLossOptions {
  direction?: TradeDirection;
  shares?: number;
  avgCost?: number;
  /** Omit price history to keep batch responses small. */
  includeHistory?: boolean;
}

export async function adviseStopLoss(
  symbol: string,
  options: AdviseStopLossOptions = {}
): Promise<StopLossRecommendation> {
  const {
    direction = "long",
    shares,
    avgCost,
    includeHistory = true,
  } = options;

  const upperSymbol = symbol.trim().toUpperCase();
  if (!upperSymbol) {
    throw new Error("Symbol is required");
  }

  const lastUpdated = new Date().toISOString();

  const [dailyHistory, quote] = await Promise.all([
    fetchDailyHistory(upperSymbol),
    fetchQuote(upperSymbol),
  ]);

  const history = mergeLiveQuoteIntoHistory(dailyHistory, quote);
  if (history.length < 30) {
    throw new Error(`Not enough price history for ${upperSymbol}`);
  }

  const supportLevels = findSupportLevels(history);
  const resistanceLevels = findResistanceLevels(history);
  const pastDips = findHistoricalDipRecoveries(history);

  const currentPrice =
    quote.regularMarketPrice ?? history[history.length - 1].close;

  let nearestSupport = null;
  let nearestResistance = null;
  let stopPlan;

  if (direction === "long") {
    const scoring = scoreLongDipOpportunity(history, supportLevels, pastDips);
    nearestSupport = scoring.nearestSupport;
    stopPlan = computeLongStopLoss(
      currentPrice,
      nearestSupport,
      history,
      pastDips
    );
  } else {
    const scoring = scoreShortOpportunity(
      history,
      resistanceLevels,
      supportLevels
    );
    nearestResistance = scoring.nearestResistance;
    stopPlan = computeShortStopLoss(
      currentPrice,
      nearestResistance,
      history,
      pastDips
    );
  }

  const sharesNum = shares != null && shares > 0 ? shares : null;
  const costNum =
    avgCost != null && Number.isFinite(avgCost) && avgCost > 0 ? avgCost : null;

  const positionValue = sharesNum != null ? currentPrice * sharesNum : null;
  const maxLossDollars =
    sharesNum != null
      ? direction === "long"
        ? (currentPrice - stopPlan.stopLossPrice) * sharesNum
        : (stopPlan.stopLossPrice - currentPrice) * sharesNum
      : null;

  const costBasis = costNum != null && sharesNum != null ? costNum * sharesNum : null;

  // Per-share outcome if the stop fills, measured against what was paid.
  const perShareOutcome =
    costNum != null
      ? direction === "long"
        ? stopPlan.stopLossPrice - costNum
        : costNum - stopPlan.stopLossPrice
      : null;

  const outcomeAtStopDollars =
    perShareOutcome != null && sharesNum != null
      ? perShareOutcome * sharesNum
      : null;

  const outcomeAtStopPercent =
    perShareOutcome != null && costNum != null
      ? (perShareOutcome / costNum) * 100
      : null;

  return {
    symbol: upperSymbol,
    name: quote.shortName ?? quote.longName ?? upperSymbol,
    direction,
    currentPrice,
    shares: sharesNum,
    positionValue,
    maxLossDollars,
    avgCost: costNum,
    costBasis,
    outcomeAtStopDollars,
    outcomeAtStopPercent,
    stopLocksInGain: (perShareOutcome ?? 0) > 0,
    nearestSupport,
    nearestResistance,
    supportLevels,
    resistanceLevels,
    history: includeHistory ? history : [],
    marketState: quote.marketState ?? "UNKNOWN",
    lastUpdated,
    ...stopPlan,
  };
}
