import { describe, expect, it } from "vitest";
import {
  EPS_BEAT_PRIOR,
  betaBinomialBeatRate,
  forecastDividend,
  forecastEarnings,
  inferReportMove,
  predictiveChanceAbove,
  signedSurprise,
} from "./event-forecast";
import type { PricePoint } from "./types";

function bar(date: string, close: number): PricePoint {
  return { date, open: close, high: close, low: close, close, volume: 1_000 };
}

describe("signedSurprise", () => {
  it("is (actual − estimate) / |estimate| when the estimate is material", () => {
    expect(signedSurprise(1.1, 1)).toBeCloseTo(0.1, 10);
    expect(signedSurprise(0.9, 1)).toBeCloseTo(-0.1, 10);
  });

  it("floors the scale at 5 cents so a $0.00 estimate cannot explode", () => {
    expect(signedSurprise(0.02, 0)).toBeCloseTo(0.4, 10);
  });
});

describe("betaBinomialBeatRate", () => {
  it("shrinks a 4-for-4 streak toward the market prior", () => {
    const rate = betaBinomialBeatRate(4, 4);
    expect(rate).toBeGreaterThan(EPS_BEAT_PRIOR);
    expect(rate).toBeLessThan(1);
    expect(rate).toBeCloseTo((EPS_BEAT_PRIOR * 8 + 4) / 12, 10);
  });

  it("equals the prior with no observations", () => {
    expect(betaBinomialBeatRate(0, 0)).toBeCloseTo(EPS_BEAT_PRIOR, 10);
  });
});

describe("predictiveChanceAbove", () => {
  it("puts most of the mass above zero when every surprise was a beat", () => {
    const result = predictiveChanceAbove(
      [0.08, 0.06, 0.1, 0.05, 0.07, 0.09],
      0,
      0.03
    );
    expect(result).not.toBeNull();
    expect(result!.chance).toBeGreaterThan(0.8);
  });

  it("puts most of the mass below zero when every surprise was a miss", () => {
    const result = predictiveChanceAbove(
      [-0.08, -0.06, -0.1, -0.05, -0.07, -0.09],
      0,
      0.03
    );
    expect(result).not.toBeNull();
    expect(result!.chance).toBeLessThan(0.2);
  });
});

describe("forecastEarnings", () => {
  const beatHistory = Array.from({ length: 8 }, (_, index) => ({
    period: `-${index}q`,
    quarter: `2024-0${(index % 4) + 1}-01`,
    epsActual: 1.12,
    epsEstimate: 1.0,
  }));

  it("projects above consensus and recommends a buy when beats are persistent", () => {
    const forecast = forecastEarnings({
      consensus: 1.0,
      low: 0.95,
      high: 1.08,
      revenueAvg: 50_000_000_000,
      revenueLow: 49_000_000_000,
      revenueHigh: 51_000_000_000,
      yearAgoEps: 0.9,
      analystCount: 28,
      revision30d: 0.02,
      surprises: beatHistory,
      printMoves: beatHistory.map(() => ({
        surprisePercent: 0.12,
        nextDayReturn: 0.025,
      })),
      qualityGrade: "Durable",
      atrPercent: 0.015,
    });

    expect(forecast.kind).toBe("earnings");
    expect(forecast.hitChance).toBeGreaterThan(0.75);
    expect(forecast.projected.ourEstimate).toBeGreaterThan(1);
    expect(forecast.trade.stance).toBe("buy");
    expect(forecast.trade.direction).toBe("long");
    expect(forecast.rangeHitChance).not.toBeNull();
    expect(forecast.calculation.toLowerCase()).toContain("student-t");
  });

  it("does not invent a short on a durable name with a coin-flip print", () => {
    const mixed = [
      { period: "-1q", quarter: null, epsActual: 1.02, epsEstimate: 1 },
      { period: "-2q", quarter: null, epsActual: 0.97, epsEstimate: 1 },
      { period: "-3q", quarter: null, epsActual: 1.01, epsEstimate: 1 },
      { period: "-4q", quarter: null, epsActual: 0.99, epsEstimate: 1 },
    ];
    const forecast = forecastEarnings({
      consensus: 1,
      low: 0.7,
      high: 1.4,
      revenueAvg: null,
      revenueLow: null,
      revenueHigh: null,
      yearAgoEps: null,
      analystCount: 8,
      revision30d: null,
      surprises: mixed,
      printMoves: [],
      qualityGrade: "Fair",
      atrPercent: 0.02,
    });

    expect(forecast.trade.stance).toBe("wait");
    expect(forecast.trade.direction).toBe("none");
    expect(forecast.confidence).not.toBe("High");
  });

  it("skips trading a pass-grade name even with a high beat rate", () => {
    const forecast = forecastEarnings({
      consensus: 0.4,
      low: 0.3,
      high: 0.5,
      revenueAvg: null,
      revenueLow: null,
      revenueHigh: null,
      yearAgoEps: null,
      analystCount: 12,
      revision30d: null,
      surprises: beatHistory,
      printMoves: beatHistory.map(() => ({
        surprisePercent: 0.12,
        nextDayReturn: 0.04,
      })),
      qualityGrade: "Pass",
      atrPercent: 0.04,
    });

    expect(forecast.trade.stance).toBe("skip");
    expect(forecast.trade.whenWindow).toBe("avoid");
  });
});

describe("forecastDividend", () => {
  it("treats a declared, well-covered dividend as a hold-through, not a buy", () => {
    const forecast = forecastDividend({
      annualRate: 4,
      trailingAnnual: 4,
      yield: 0.02,
      fiveYearAvgYield: 0.018,
      payoutRatio: 0.35,
      fcfPositive: true,
      profitable: true,
      qualityGrade: "Durable",
      declared: true,
    });

    expect(forecast.projected.ourEstimate).toBeCloseTo(1, 10);
    expect(forecast.hitChance).toBeGreaterThan(0.9);
    expect(forecast.trade.stance).toBe("hold-through");
    expect(forecast.trade.direction).toBe("none");
  });

  it("flags a stretched payout as skip / sell-before-ex", () => {
    const forecast = forecastDividend({
      annualRate: 2,
      trailingAnnual: 2,
      yield: 0.08,
      fiveYearAvgYield: 0.04,
      payoutRatio: 1.2,
      fcfPositive: false,
      profitable: false,
      qualityGrade: "Speculative",
      declared: true,
    });

    expect(forecast.hitChance).toBeLessThan(0.6);
    expect(forecast.trade.stance).toBe("skip");
    expect(forecast.trade.when.toLowerCase()).toContain("ex-date");
  });
});

describe("inferReportMove", () => {
  it("picks the distinctive day in the post-quarter window", () => {
    const history: PricePoint[] = [];
    let close = 100;
    for (let i = 0; i < 80; i++) {
      const date = new Date(Date.UTC(2024, 0, 1 + i));
      const iso = date.toISOString().slice(0, 10);
      const jump = iso === "2024-02-05" ? 1.06 : 1.001;
      close *= jump;
      history.push(bar(iso, close));
    }

    const move = inferReportMove(history, "2024-01-15");
    expect(move).not.toBeNull();
    expect(move!.date).toBe("2024-02-05");
    expect(move!.nextDayReturn).toBeCloseTo(0.06, 2);
  });
});
