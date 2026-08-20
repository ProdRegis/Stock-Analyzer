import { describe, expect, it } from "vitest";
import { scoreBusinessQuality } from "./business-quality";
import type { CompanyFundamentals } from "./fundamentals";
import { buildInvestmentThesis } from "./investment-thesis";

function base(over: Partial<CompanyFundamentals> = {}): CompanyFundamentals {
  return {
    symbol: "CMG",
    name: "Chipotle",
    currentPrice: 50,
    currency: "USD",
    sector: "Consumer Cyclical",
    industry: "Restaurants",
    website: null,
    summary:
      "Chipotle Mexican Grill operates fast-casual restaurants. Customers come for food that is healthy enough, quick, and relatively cheap.",
    marketCap: 70_000_000_000,
    enterpriseValue: 69_000_000_000,
    totalRevenue: 11_000_000_000,
    totalCash: 1_000_000_000,
    totalDebt: 4_000_000_000,
    freeCashflow: 1_500_000_000,
    operatingCashflow: 2_000_000_000,
    netIncome: 1_400_000_000,
    revenueGrowth: 0.12,
    earningsGrowth: 0.15,
    grossMargins: 0.26,
    operatingMargins: 0.17,
    profitMargins: 0.13,
    returnOnEquity: 0.4,
    returnOnAssets: 0.15,
    debtToEquity: 30,
    trailingPe: 40,
    forwardPe: 32,
    forwardEps: 1.6,
    trailingEps: 1.25,
    sharesOutstanding: 1_400_000_000,
    targetMeanPrice: 60,
    recommendationKey: "buy",
    ...over,
  };
}

describe("buildInvestmentThesis", () => {
  it("writes a buy plan when conservative cash flows clear the hurdle", () => {
    const fundamentals = base({
      currentPrice: 12,
      marketCap: 12_000_000_000,
      enterpriseValue: 12_000_000_000,
      freeCashflow: 2_000_000_000,
    });
    const thesis = buildInvestmentThesis({
      fundamentals,
      quality: scoreBusinessQuality(fundamentals),
      riskFreeRate: 0.043,
      peers: [],
    });

    expect(thesis.quality.grade).toBe("Durable");
    expect(thesis.valuation.method).toBe("fcf");
    expect(thesis.valuation.impliedReturn).not.toBeNull();
    expect(thesis.valuation.impliedReturn!).toBeGreaterThan(
      thesis.valuation.hurdleRate
    );
    expect(thesis.plan.stance).toBe("buy");
    expect(thesis.plan.buyAt).toBe(12);
    expect(thesis.plan.sellAt).not.toBeNull();
    expect(thesis.plan.whenToBuy.toLowerCase()).toContain("now");
  });

  it("waits when the same business is priced for a low return", () => {
    const fundamentals = base({
      currentPrice: 200,
      marketCap: 280_000_000_000,
      enterpriseValue: 280_000_000_000,
      freeCashflow: 1_500_000_000,
    });
    const thesis = buildInvestmentThesis({
      fundamentals,
      quality: scoreBusinessQuality(fundamentals),
      riskFreeRate: 0.043,
      peers: [],
    });

    expect(thesis.plan.stance).toBe("wait");
    expect(thesis.plan.buyAt).not.toBeNull();
    expect(thesis.plan.buyAt!).toBeLessThan(200);
    expect(thesis.createValue.toLowerCase()).toContain("customer");
    expect(thesis.bearCase.length).toBeGreaterThan(0);
  });

  it("passes unprofitable biotech instead of inventing a buy price", () => {
    const fundamentals = base({
      symbol: "MRNA",
      name: "Moderna",
      sector: "Healthcare",
      industry: "Biotechnology",
      operatingMargins: -0.4,
      profitMargins: -0.5,
      freeCashflow: -1_000_000_000,
      netIncome: -800_000_000,
      debtToEquity: 20,
    });
    const thesis = buildInvestmentThesis({
      fundamentals,
      quality: scoreBusinessQuality(fundamentals),
      riskFreeRate: 0.043,
      peers: [],
    });

    expect(thesis.plan.stance).toBe("pass");
    expect(thesis.plan.buyAt).toBeNull();
    expect(thesis.quality.hardIndustry).toBe(true);
    expect(thesis.valuation.method).toBe("unavailable");
  });

  it("does not invent create/capture copy when the snapshot is empty", () => {
    const fundamentals = base({
      summary: null,
      operatingMargins: null,
      profitMargins: null,
      totalRevenue: null,
    });
    const thesis = buildInvestmentThesis({
      fundamentals,
      quality: scoreBusinessQuality(fundamentals),
      riskFreeRate: 0.043,
      peers: [],
    });

    expect(thesis.createValue.toLowerCase()).toContain("10-k");
    expect(thesis.captureValue.toLowerCase()).toContain("snapshot");
    expect(thesis.valuation.scenarios.length).toBeGreaterThan(0);
  });
});
