import type { PricePoint } from "./types";
import { formatPValue, studentTTwoTailedP, tCrit95 } from "./stats";

export function dateKey(value: string): string {
  return value.split("T")[0];
}

export function logDailyReturns(prices: number[]): number[] {
  const returns: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] <= 0 || prices[i] <= 0) continue;
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  return returns;
}

export function dailyReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] === 0) continue;
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

export function alignedPairReturns(
  stockHistory: PricePoint[],
  marketHistory: PricePoint[]
): { stockReturns: number[]; marketReturns: number[] } {
  const marketByDate = new Map(
    marketHistory.map((point) => [dateKey(point.date), point.close])
  );

  const stockReturns: number[] = [];
  const marketReturns: number[] = [];

  for (let i = 1; i < stockHistory.length; i++) {
    const prevDate = dateKey(stockHistory[i - 1].date);
    const currentDate = dateKey(stockHistory[i].date);
    const prevMarket = marketByDate.get(prevDate);
    const currentMarket = marketByDate.get(currentDate);

    if (
      prevMarket == null ||
      currentMarket == null ||
      stockHistory[i - 1].close <= 0 ||
      prevMarket <= 0
    ) {
      continue;
    }

    stockReturns.push(
      Math.log(stockHistory[i].close / stockHistory[i - 1].close)
    );
    marketReturns.push(Math.log(currentMarket / prevMarket));
  }

  return { stockReturns, marketReturns };
}

export function alignedMultiSeriesReturns(histories: PricePoint[][]): number[][] {
  if (histories.length === 0) return [];

  const maps = histories.map(
    (history) => new Map(history.map((point) => [dateKey(point.date), point.close]))
  );

  const commonDates = [...maps[0].keys()]
    .filter((date) => maps.every((map) => map.has(date)))
    .sort();

  if (commonDates.length < 2) {
    return histories.map((history) =>
      logDailyReturns(history.map((point) => point.close))
    );
  }

  return maps.map((map) => {
    const prices = commonDates.map((date) => map.get(date)!);
    return logDailyReturns(prices);
  });
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

export function annualizedVolatility(returns: number[]): number {
  return stdDev(returns) * Math.sqrt(252);
}

export function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  const sliceA = a.slice(-n);
  const sliceB = b.slice(-n);
  const meanA = mean(sliceA);
  const meanB = mean(sliceB);

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (sliceA[i] - meanA) * (sliceB[i] - meanB);
  }
  return sum / (n - 1);
}

export interface OlsFit {
  n: number;
  r: number;
  rSquared: number;
  beta: number;
  betaStdError: number;
  tStat: number;
  pValue: number;
  betaCiLow: number;
  betaCiHigh: number;
}

/**
 * Simple OLS of y on x: the same slope as `beta()`, plus r, R² = r², the
 * t-statistic, two-tailed p-value, and a 95% interval for the slope.
 *
 * Returns null when the slope is unidentified — fewer than 3 points, or x
 * never moves.
 */
export function olsFit(y: number[], x: number[]): OlsFit | null {
  const n = Math.min(y.length, x.length);
  if (n < 3) return null;

  const sliceY = y.slice(-n);
  const sliceX = x.slice(-n);
  const stdX = stdDev(sliceX);
  const stdY = stdDev(sliceY);
  if (stdX === 0) return null;

  const rRaw = stdY === 0 ? 0 : covariance(sliceY, sliceX) / (stdY * stdX);
  const r = Math.max(-1, Math.min(1, rRaw));
  const rSquared = r * r;
  const slope = covariance(sliceY, sliceX) / covariance(sliceX, sliceX);

  const df = n - 2;
  const residualScale = Math.sqrt(Math.max(0, 1 - rSquared) / df);
  const betaStdError = residualScale * (stdY / stdX);
  const tStat =
    rSquared >= 1 - 1e-15
      ? r >= 0
        ? 1e6
        : -1e6
      : r * Math.sqrt(df / (1 - rSquared));
  const pValue = Number.isFinite(tStat) ? studentTTwoTailedP(tStat, df) : 0;
  const crit = tCrit95(df);
  const halfWidth = Number.isFinite(betaStdError) ? crit * betaStdError : 0;

  return {
    n,
    r,
    rSquared,
    beta: slope,
    betaStdError,
    tStat,
    pValue,
    betaCiLow: slope - halfWidth,
    betaCiHigh: slope + halfWidth,
  };
}

export type ReliabilityLevel = "Strong" | "Moderate" | "Weak" | "Thin";

export interface ReliabilityAssessment {
  level: ReliabilityLevel;
  score: number;
  summary: string;
}

/**
 * Turns an OLS fit into a 0–100 score and a plain-language label.
 *
 * Sample size, R², and significance all have to be decent. A statistically
 * significant beta that explains 4% of daily moves is still a weak descriptor,
 * which is the case the R² term exists to catch.
 */
export function assessReliability(
  fit: OlsFit | null
): ReliabilityAssessment {
  if (fit == null || fit.n < 60) {
    const n = fit?.n ?? 0;
    return {
      level: "Thin",
      score: Math.round(Math.min(40, (n / 60) * 40)),
      summary:
        n === 0
          ? "Not enough aligned history to judge how well this tracks the market."
          : `Only ${n} aligned days — too little history for a stable beta.`,
    };
  }

  const nScore = Math.min(1, fit.n / 252);
  const r2Score = Math.min(1, fit.rSquared / 0.4);
  const sigScore =
    fit.pValue < 0.001 ? 1 : fit.pValue < 0.01 ? 0.85 : fit.pValue < 0.05 ? 0.55 : 0.15;
  const score = Math.round(100 * (0.3 * nScore + 0.45 * r2Score + 0.25 * sigScore));

  // A long sample can make a tiny r "significant" without making beta useful.
  // R² below 0.10 means the market explains almost none of the daily moves.
  let level: ReliabilityLevel = "Weak";
  if (fit.rSquared >= 0.1 && fit.pValue <= 0.05) {
    if (score >= 70) level = "Strong";
    else if (score >= 45) level = "Moderate";
  }

  const pct = (fit.rSquared * 100).toFixed(0);
  const rLabel = fit.r.toFixed(2);
  const r2Label = fit.rSquared.toFixed(2);
  const pLabel = formatPValue(fit.pValue);

  let summary: string;
  if (fit.pValue > 0.05) {
    summary = `The link with SPY is not statistically significant (p = ${pLabel}). Beta is mostly noise.`;
  } else if (level === "Weak") {
    summary = `SPY explains only ${pct}% of daily moves (R² = ${r2Label}, r = ${rLabel}, n = ${fit.n}). Beta is a weak descriptor.`;
  } else if (level === "Moderate") {
    summary = `SPY explains ${pct}% of daily moves (R² = ${r2Label}, r = ${rLabel}, n = ${fit.n}). Beta is usable but noisy.`;
  } else {
    summary = `SPY explains ${pct}% of daily moves (R² = ${r2Label}, r = ${rLabel}, n = ${fit.n}). Beta is well identified.`;
  }

  return { level, score, summary };
}

/** Average of r² across off-diagonal pairs — shared variance, not correlation. */
export function averagePairRSquared(returnsMatrix: number[][]): number {
  const n = returnsMatrix.length;
  if (n < 2) return 0;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = correlation(returnsMatrix[i], returnsMatrix[j]);
      sum += r * r;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

export function beta(stockReturns: number[], marketReturns: number[]): number {
  return olsFit(stockReturns, marketReturns)?.beta ?? 1;
}

export function maxDrawdown(prices: number[]): number {
  if (prices.length === 0) return 0;

  let peak = prices[0];
  let maxDrop = 0;

  for (const price of prices) {
    peak = Math.max(peak, price);
    const drawdown = (peak - price) / peak;
    maxDrop = Math.max(maxDrop, drawdown);
  }

  return maxDrop;
}

export function sharpeRatio(returns: number[], riskFreeRate = 0.04): number {
  const dailyStd = stdDev(returns);
  if (dailyStd === 0) return 0;

  const dailyRiskFree = riskFreeRate / 252;
  const dailySharpe = (mean(returns) - dailyRiskFree) / dailyStd;

  // Standard annualization for daily log returns.
  return dailySharpe * Math.sqrt(252);
}

export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  const sliceA = a.slice(-n);
  const sliceB = b.slice(-n);
  const stdA = stdDev(sliceA);
  const stdB = stdDev(sliceB);

  if (stdA === 0 || stdB === 0) return 0;
  return covariance(sliceA, sliceB) / (stdA * stdB);
}

export function riskScore(
  volatility: number,
  betaValue: number,
  drawdown: number
): number {
  const volScore = Math.min(100, (volatility / 0.6) * 100);
  const betaScore = Math.min(100, (Math.abs(betaValue) / 2) * 100);
  const drawdownScore = Math.min(100, (drawdown / 0.5) * 100);

  return Math.round(volScore * 0.45 + betaScore * 0.3 + drawdownScore * 0.25);
}

export function riskLevel(
  score: number
): "Low" | "Moderate" | "High" | "Very High" {
  if (score < 25) return "Low";
  if (score < 50) return "Moderate";
  if (score < 75) return "High";
  return "Very High";
}

export function portfolioVolatilityAligned(
  weights: number[],
  alignedReturns: number[][]
): number {
  const periods = alignedReturns[0]?.length ?? 0;
  if (periods < 2 || weights.length === 0) return 0;

  const portfolioReturns: number[] = [];

  for (let t = 0; t < periods; t++) {
    portfolioReturns.push(
      weights.reduce((sum, weight, index) => sum + weight * alignedReturns[index][t], 0)
    );
  }

  return annualizedVolatility(portfolioReturns);
}

export function portfolioVolatility(
  weights: number[],
  returnsMatrix: number[][]
): number {
  return portfolioVolatilityAligned(weights, returnsMatrix);
}

export function herfindahlIndex(weights: number[]): number {
  return weights.reduce((sum, weight) => sum + weight ** 2, 0);
}

export function diversificationScore(weights: number[]): number {
  const hhi = herfindahlIndex(weights);
  const n = weights.length;
  if (n <= 1) return 0;
  return Math.round((1 - (hhi - 1 / n) / (1 - 1 / n)) * 100);
}

export function averageCorrelation(returnsMatrix: number[][]): number {
  const n = returnsMatrix.length;
  if (n < 2) return 0;

  let sum = 0;
  let count = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sum += correlation(returnsMatrix[i], returnsMatrix[j]);
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

/** Full symmetric pairwise correlation matrix, with 1.0 on the diagonal. */
export function correlationMatrix(returnsMatrix: number[][]): number[][] {
  const n = returnsMatrix.length;
  const matrix: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0)
  );

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const value = correlation(returnsMatrix[i], returnsMatrix[j]);
      matrix[i][j] = value;
      matrix[j][i] = value;
    }
  }

  return matrix;
}

export function compareDesc(a: number, b: number, fallback = 0): number {
  if (b !== a) return b - a;
  return fallback;
}
