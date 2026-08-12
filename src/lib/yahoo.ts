import {
  alignedPairReturns,
  annualizedVolatility,
  beta,
  maxDrawdown,
  riskLevel,
  riskScore,
  sharpeRatio,
} from "./risk";
import { fetchRiskFreeRate } from "./market-rates";
import { reconcileBeta } from "./metric-validation";
import {
  computeMovingAverages,
  detectBreakout,
  findResistanceLevels,
  findSupportLevels,
} from "./technical";
import type { PricePoint, StockAnalysis } from "./types";
import {
  fetchDailyHistory,
  fetchQuote,
  mergeLiveQuoteIntoHistory,
} from "./market-data";
import { TTL, cached } from "./cache";
import { yahooFinance } from "./yahoo-client";

export interface AnalyzeStockOptions {
  marketHistory?: PricePoint[];
  riskFreeRate?: number;
  riskFreeSource?: string;
}

export async function analyzeStock(
  symbol: string,
  options: AnalyzeStockOptions = {}
): Promise<StockAnalysis> {
  const upperSymbol = symbol.toUpperCase();

  const needSpy = !options.marketHistory;

  const [dailyHistory, quote, spyDaily, spyQuote, summary, rateInfo] =
    await Promise.all([
      fetchDailyHistory(upperSymbol),
      fetchQuote(upperSymbol),
      needSpy ? fetchDailyHistory("SPY") : Promise.resolve(null),
      needSpy ? fetchQuote("SPY") : Promise.resolve(null),
      cached(`summary:${upperSymbol}:keystats`, TTL.quoteSummary, () =>
        yahooFinance.quoteSummary(upperSymbol, {
          modules: ["defaultKeyStatistics"],
        })
      ).catch(() => null),
      options.riskFreeRate != null
        ? Promise.resolve({
            rate: options.riskFreeRate,
            source: options.riskFreeSource ?? "provided",
          })
        : fetchRiskFreeRate(),
    ]);

  const marketHistory =
    options.marketHistory ??
    mergeLiveQuoteIntoHistory(spyDaily!, spyQuote as Record<string, unknown>);

  const history = mergeLiveQuoteIntoHistory(dailyHistory, quote);

  if (history.length < 60) {
    throw new Error(`Insufficient historical data for ${upperSymbol}`);
  }

  const closes = history.map((point) => point.close);
  const { stockReturns, marketReturns } = alignedPairReturns(
    history,
    marketHistory
  );

  if (stockReturns.length < 30) {
    throw new Error(`Insufficient aligned return data for ${upperSymbol}`);
  }

  const calculatedVol = annualizedVolatility(stockReturns);
  const calculatedBeta = beta(stockReturns, marketReturns);
  const drawdown = maxDrawdown(closes);
  const sharpe = sharpeRatio(stockReturns, rateInfo.rate);

  const betaReconciled = reconcileBeta(
    calculatedBeta,
    summary?.defaultKeyStatistics?.beta ?? null
  );

  const score = riskScore(
    calculatedVol,
    betaReconciled.value,
    drawdown
  );

  const resistanceLevels = findResistanceLevels(history);
  const supportLevels = findSupportLevels(history);
  const breakout = detectBreakout(history, resistanceLevels, supportLevels);

  return {
    symbol: upperSymbol,
    name: quote.shortName ?? quote.longName ?? upperSymbol,
    currentPrice: quote.regularMarketPrice ?? closes[closes.length - 1],
    currency: quote.currency ?? "USD",
    changePercent: quote.regularMarketChangePercent ?? 0,
    history,
    movingAverages: computeMovingAverages(closes),
    resistanceLevels,
    supportLevels,
    breakout,
    risk: {
      annualizedVolatility: calculatedVol,
      beta: betaReconciled.value,
      maxDrawdown: drawdown,
      sharpeRatio: sharpe,
      riskScore: score,
      riskLevel: riskLevel(score),
      metricSources: {
        prices: "Yahoo Finance adjusted daily closes (2y)",
        benchmark: "SPY date-aligned log returns",
        riskFreeRate: rateInfo.source,
        beta: betaReconciled.source,
        volatility: "Log-return std dev × √252 (aligned)",
        sharpe: `Excess log returns, rf=${(rateInfo.rate * 100).toFixed(2)}%, ×√252`,
      },
    },
  };
}
