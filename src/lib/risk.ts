import type { PricePoint } from "./types";

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

export function beta(stockReturns: number[], marketReturns: number[]): number {
  const marketVariance = covariance(marketReturns, marketReturns);
  if (marketVariance === 0) return 1;
  return covariance(stockReturns, marketReturns) / marketVariance;
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
