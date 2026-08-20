import { describe, expect, it } from "vitest";
import {
  qualityRankBoost,
  scoreBusinessQuality,
} from "./business-quality";
import type { CompanyFundamentals } from "./fundamentals";

function base(over: Partial<CompanyFundamentals> = {}): CompanyFundamentals {
  return {
    symbol: "TEST",
    name: "Test Co",
    currentPrice: 100,
    currency: "USD",
    sector: "Consumer Cyclical",
    industry: "Restaurants",
    website: null,
    summary: "Sells burritos.",
    marketCap: 50_000_000_000,
    enterpriseValue: 52_000_000_000,
    totalRevenue: 10_000_000_000,
    totalCash: 1_000_000_000,
    totalDebt: 2_000_000_000,
    freeCashflow: 1_200_000_000,
    operatingCashflow: 1_500_000_000,
    netIncome: 1_000_000_000,
    revenueGrowth: 0.08,
    earningsGrowth: 0.1,
    grossMargins: 0.3,
    operatingMargins: 0.18,
    profitMargins: 0.12,
    returnOnEquity: 0.22,
    returnOnAssets: 0.1,
    debtToEquity: 40,
    trailingPe: 28,
    forwardPe: 24,
    forwardEps: 4.2,
    trailingEps: 3.6,
    sharesOutstanding: 500_000_000,
    targetMeanPrice: 110,
    recommendationKey: "buy",
    ...over,
  };
}

describe("scoreBusinessQuality", () => {
  it("grades a profitable, high-margin, cash-generative name Durable", () => {
    const result = scoreBusinessQuality(base());
    expect(result.grade).toBe("Durable");
    expect(result.hardIndustry).toBe(false);
  });

  it("grades a loss-making name Speculative", () => {
    const result = scoreBusinessQuality(
      base({
        operatingMargins: -0.05,
        profitMargins: -0.08,
        freeCashflow: -200_000_000,
      })
    );
    expect(result.grade).toBe("Speculative");
  });

  it("kicks out unprofitable biotech as Pass", () => {
    const result = scoreBusinessQuality(
      base({
        sector: "Healthcare",
        industry: "Biotechnology",
        operatingMargins: -1.2,
        profitMargins: -1.4,
        freeCashflow: -80_000_000,
      })
    );
    expect(result.grade).toBe("Pass");
    expect(result.hardIndustry).toBe(true);
  });
});

describe("qualityRankBoost", () => {
  it("lifts durable longs and penalizes shorting them", () => {
    expect(qualityRankBoost("Durable", "long")).toBeGreaterThan(0);
    expect(qualityRankBoost("Durable", "short")).toBeLessThan(0);
  });

  it("does the opposite for Pass names", () => {
    expect(qualityRankBoost("Pass", "long")).toBeLessThan(0);
    expect(qualityRankBoost("Pass", "short")).toBeGreaterThan(0);
  });
});
