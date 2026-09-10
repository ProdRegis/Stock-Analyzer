import { describe, expect, it } from "vitest";
import {
  alignedMultiSeriesReturns,
  alignedPairReturns,
  annualizedVolatility,
  assessReliability,
  averageCorrelation,
  averagePairRSquared,
  beta,
  correlation,
  correlationMatrix,
  dailyReturns,
  diversificationScore,
  herfindahlIndex,
  logDailyReturns,
  maxDrawdown,
  olsFit,
  portfolioVolatilityAligned,
  riskLevel,
  sharpeRatio,
  stdDev,
} from "./risk";
import type { PricePoint } from "./types";

function bar(date: string, close: number): PricePoint {
  return { date, open: close, high: close, low: close, close, volume: 1_000 };
}

describe("returns", () => {
  it("computes log returns", () => {
    expect(logDailyReturns([100, 110])).toHaveLength(1);
    expect(logDailyReturns([100, 110])[0]).toBeCloseTo(Math.log(1.1), 10);
  });

  it("computes simple returns", () => {
    expect(dailyReturns([100, 110])[0]).toBeCloseTo(0.1, 10);
  });

  it("skips non-positive prices rather than producing NaN or Infinity", () => {
    const returns = logDailyReturns([100, 0, 50, 55]);
    expect(returns.every(Number.isFinite)).toBe(true);
  });

  it("returns nothing for a single price", () => {
    expect(logDailyReturns([100])).toEqual([]);
    expect(dailyReturns([100])).toEqual([]);
  });
});

describe("stdDev and annualizedVolatility", () => {
  it("uses the sample standard deviation", () => {
    // mean 3, squared deviations sum to 10, divided by n-1 = 4.
    expect(stdDev([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2.5), 10);
  });

  it("is zero when there is no variation or too little data", () => {
    expect(stdDev([7, 7, 7])).toBe(0);
    expect(stdDev([7])).toBe(0);
  });

  it("annualizes by the square root of 252 trading days", () => {
    const returns = [0.01, -0.01, 0.01, -0.01];
    expect(annualizedVolatility(returns)).toBeCloseTo(
      stdDev(returns) * Math.sqrt(252),
      12
    );
    // Sanity check against a hand-computed value rather than the formula alone.
    expect(annualizedVolatility(returns)).toBeCloseTo(0.18331, 4);
  });
});

describe("beta", () => {
  it("is 1 against itself", () => {
    const market = [0.01, -0.02, 0.015, 0.004, -0.008];
    expect(beta(market, market)).toBeCloseTo(1, 10);
  });

  it("is 2 when the stock moves twice as much as the market", () => {
    const market = [0.01, -0.02, 0.015, 0.004, -0.008];
    const stock = market.map((value) => value * 2);
    expect(beta(stock, market)).toBeCloseTo(2, 10);
  });

  it("is negative for an inversely moving stock", () => {
    const market = [0.01, -0.02, 0.015, 0.004, -0.008];
    const stock = market.map((value) => -value);
    expect(beta(stock, market)).toBeCloseTo(-1, 10);
  });

  it("falls back to 1 when the market never moves", () => {
    expect(beta([0.01, 0.02], [0, 0])).toBe(1);
  });
});

describe("maxDrawdown", () => {
  it("measures the largest peak-to-trough drop", () => {
    expect(maxDrawdown([100, 120, 60, 90])).toBeCloseTo(0.5, 10);
  });

  it("ignores recovery after the trough", () => {
    expect(maxDrawdown([100, 50, 100])).toBeCloseTo(0.5, 10);
  });

  it("is zero for a series that only rises", () => {
    expect(maxDrawdown([10, 20, 30])).toBe(0);
  });

  it("is zero for an empty series", () => {
    expect(maxDrawdown([])).toBe(0);
  });
});

describe("sharpeRatio", () => {
  it("annualizes the daily ratio by the square root of 252", () => {
    const returns = [0.01, 0.02, 0.01, 0.02];
    // mean 0.015, sample sd 0.0057735 -> 2.598076 daily, x sqrt(252).
    expect(sharpeRatio(returns, 0)).toBeCloseTo(41.2432, 3);
  });

  it("subtracts the risk-free rate on a daily basis", () => {
    const returns = [0.01, 0.02, 0.01, 0.02];
    expect(sharpeRatio(returns, 0.04)).toBeLessThan(sharpeRatio(returns, 0));
  });

  it("is zero when returns never vary", () => {
    expect(sharpeRatio([0.01, 0.01, 0.01])).toBe(0);
  });
});

describe("correlation", () => {
  it("is 1 for identical series and -1 for inverted ones", () => {
    const a = [0.01, -0.02, 0.03, 0.005];
    expect(correlation(a, a)).toBeCloseTo(1, 10);
    expect(correlation(a, a.map((v) => -v))).toBeCloseTo(-1, 10);
  });

  it("is zero when one series is flat", () => {
    expect(correlation([0.01, 0.02, 0.03], [1, 1, 1])).toBe(0);
  });

  it("produces a symmetric matrix with a unit diagonal", () => {
    const matrix = correlationMatrix([
      [0.01, -0.02, 0.03],
      [0.02, -0.01, 0.04],
    ]);

    expect(matrix[0][0]).toBeCloseTo(1, 10);
    expect(matrix[1][1]).toBeCloseTo(1, 10);
    expect(matrix[0][1]).toBeCloseTo(matrix[1][0], 10);
  });

  it("averages only the off-diagonal pairs", () => {
    const a = [0.01, -0.02, 0.03];
    expect(averageCorrelation([a, a])).toBeCloseTo(1, 10);
  });
});

describe("olsFit", () => {
  it("reports R² equal to r squared, and a beta that matches beta()", () => {
    const market = [0.01, -0.02, 0.015, 0.004, -0.008, 0.012, 0.003];
    const stock = market.map((value) => value * 1.4);
    const fit = olsFit(stock, market);

    expect(fit).not.toBeNull();
    expect(fit!.beta).toBeCloseTo(beta(stock, market), 10);
    expect(fit!.r).toBeCloseTo(1, 8);
    expect(fit!.rSquared).toBeCloseTo(fit!.r ** 2, 12);
    expect(fit!.rSquared).toBeCloseTo(1, 8);
    expect(fit!.n).toBe(market.length);
    expect(fit!.pValue).toBeLessThan(0.001);
  });

  it("is unidentified when the market never moves", () => {
    expect(olsFit([0.01, 0.02, 0.03], [0, 0, 0])).toBeNull();
  });

  it("is unidentified with fewer than 3 observations", () => {
    expect(olsFit([0.01, 0.02], [0.01, 0.02])).toBeNull();
  });

  it("puts the true slope inside the 95% interval for a noisy multiple", () => {
    const market: number[] = [];
    const stock: number[] = [];
    for (let i = 0; i < 400; i++) {
      const x = Math.sin(i / 7) * 0.01;
      market.push(x);
      stock.push(1.5 * x + ((i % 5) - 2) * 0.0004);
    }

    const fit = olsFit(stock, market);
    expect(fit).not.toBeNull();
    expect(fit!.betaCiLow).toBeLessThan(1.5);
    expect(fit!.betaCiHigh).toBeGreaterThan(1.5);
    expect(fit!.rSquared).toBeGreaterThan(0.9);
  });
});

describe("assessReliability", () => {
  it("labels short history as Thin even when the fit is perfect", () => {
    const x = [0.01, -0.02, 0.015, 0.004, -0.008];
    const y = x.map((value) => value * 2);
    expect(assessReliability(olsFit(y, x)).level).toBe("Thin");
  });

  it("labels a year of tight tracking as Strong", () => {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < 300; i++) {
      const value = Math.sin(i / 9) * 0.012;
      x.push(value);
      y.push(value * 1.1);
    }

    const result = assessReliability(olsFit(y, x));
    expect(result.level).toBe("Strong");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("labels an uncorrelated series as Weak", () => {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < 300; i++) {
      x.push(Math.sin(i / 9) * 0.01);
      y.push(Math.cos(i / 5) * 0.01);
    }

    const result = assessReliability(olsFit(y, x));
    expect(result.level).toBe("Weak");
  });

  it("averages r² across pairs rather than squaring the average r", () => {
    const a = [0.02, -0.01, 0.03, 0.00, 0.01];
    const b = a.map((value) => value);
    const c = a.map((value) => -value);
    // Pairs: (a,b) r=1 → r²=1, (a,c) r=-1 → r²=1, (b,c) r=-1 → r²=1
    expect(averagePairRSquared([a, b, c])).toBeCloseTo(1, 8);
  });
});

describe("concentration", () => {
  it("computes the Herfindahl index", () => {
    expect(herfindahlIndex([0.5, 0.5])).toBeCloseTo(0.5, 10);
    expect(herfindahlIndex([1])).toBeCloseTo(1, 10);
  });

  it("scores an evenly split portfolio at 100 and a single holding at 0", () => {
    expect(diversificationScore([0.5, 0.5])).toBe(100);
    expect(diversificationScore([0.25, 0.25, 0.25, 0.25])).toBe(100);
    expect(diversificationScore([1, 0])).toBe(0);
  });

  it("scores a lopsided split between the two extremes", () => {
    const score = diversificationScore([0.9, 0.1]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it("gives a single-holding portfolio no diversification credit", () => {
    expect(diversificationScore([1])).toBe(0);
  });
});

describe("riskLevel thresholds", () => {
  it("maps scores to bands at the documented boundaries", () => {
    expect(riskLevel(0)).toBe("Low");
    expect(riskLevel(24)).toBe("Low");
    expect(riskLevel(25)).toBe("Moderate");
    expect(riskLevel(49)).toBe("Moderate");
    expect(riskLevel(50)).toBe("High");
    expect(riskLevel(74)).toBe("High");
    expect(riskLevel(75)).toBe("Very High");
    expect(riskLevel(100)).toBe("Very High");
  });
});

describe("date alignment", () => {
  it("pairs returns only on dates both series share", () => {
    const stock = [
      bar("2024-01-01", 100),
      bar("2024-01-02", 110),
      bar("2024-01-04", 121),
    ];
    const market = [
      bar("2024-01-01", 200),
      bar("2024-01-02", 202),
      bar("2024-01-03", 999),
      bar("2024-01-04", 204),
    ];

    const { stockReturns, marketReturns } = alignedPairReturns(stock, market);

    // Three shared dates produce two return periods, and the market's
    // unmatched 2024-01-03 spike must not leak in.
    expect(stockReturns).toHaveLength(2);
    expect(marketReturns).toHaveLength(2);
    expect(marketReturns.every((value) => Math.abs(value) < 0.05)).toBe(true);
  });

  it("tolerates timestamps by comparing calendar dates", () => {
    const stock = [bar("2024-01-01T00:00:00Z", 100), bar("2024-01-02", 110)];
    const market = [bar("2024-01-01", 200), bar("2024-01-02T13:30:00Z", 210)];

    expect(alignedPairReturns(stock, market).stockReturns).toHaveLength(1);
  });

  it("aligns many series onto their common dates", () => {
    const aligned = alignedMultiSeriesReturns([
      [bar("2024-01-01", 100), bar("2024-01-02", 110), bar("2024-01-03", 121)],
      [bar("2024-01-01", 50), bar("2024-01-03", 55)],
    ]);

    // Only 01-01 and 01-03 are shared, so each series yields one return.
    expect(aligned).toHaveLength(2);
    expect(aligned[0]).toHaveLength(1);
    expect(aligned[1]).toHaveLength(1);
  });
});

describe("portfolioVolatilityAligned", () => {
  it("matches single-asset volatility when all weight sits in one holding", () => {
    const seriesA = [0.01, -0.02, 0.015, 0.004];
    const seriesB = [0.03, 0.01, -0.04, 0.002];

    expect(portfolioVolatilityAligned([1, 0], [seriesA, seriesB])).toBeCloseTo(
      annualizedVolatility(seriesA),
      10
    );
  });

  it("falls below the average of its parts when holdings offset each other", () => {
    const seriesA = [0.02, -0.02, 0.02, -0.02];
    const seriesB = seriesA.map((value) => -value);

    // Perfectly opposed holdings cancel out entirely.
    expect(portfolioVolatilityAligned([0.5, 0.5], [seriesA, seriesB])).toBeCloseTo(
      0,
      10
    );
  });

  it("is zero without enough periods", () => {
    expect(portfolioVolatilityAligned([1], [[0.01]])).toBe(0);
    expect(portfolioVolatilityAligned([], [])).toBe(0);
  });
});
