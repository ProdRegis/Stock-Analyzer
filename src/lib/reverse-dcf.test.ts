import { describe, expect, it } from "vitest";
import {
  conservativeGrowth,
  fadedGrowthRates,
  impliedReturn,
  presentValue,
  projectCashFlows,
  terminalValue,
  valueAtDiscountRate,
} from "./reverse-dcf";

describe("fadedGrowthRates", () => {
  it("starts at initial growth and ends at terminal growth", () => {
    const rates = fadedGrowthRates(0.1, 0.02, 5);
    expect(rates).toHaveLength(5);
    expect(rates[0]).toBeCloseTo(0.1, 10);
    expect(rates[4]).toBeCloseTo(0.02, 10);
  });
});

describe("projectCashFlows", () => {
  it("compounds starting cash flow by each year's growth", () => {
    expect(projectCashFlows(100, [0.1, 0.1])[0]).toBeCloseTo(110, 10);
    expect(projectCashFlows(100, [0.1, 0.1])[1]).toBeCloseTo(121, 10);
  });
});

describe("impliedReturn", () => {
  it("returns null when cash flow is not positive", () => {
    expect(
      impliedReturn({
        startingCashFlow: -10,
        marketValue: 1_000,
        initialGrowth: 0.05,
        terminalGrowth: 0.02,
        years: 8,
      })
    ).toBeNull();
  });

  it("recovers a known discount rate on a no-growth perpetuity", () => {
    // No-growth: PV = CF1 / r. With 0% fade to 0% terminal, year-1 CF is CF0.
    // Wait: projectCashFlows grows first, so CF1 = CF0 * (1+0) = CF0.
    // Terminal = CF1 * (1+0) / r = CF1 / r.
    // PV = CF1/(1+r) + (CF1/r)/(1+r) = CF1/r.
    // So r = CF0 / marketValue.
    const startingCashFlow = 100;
    const rate = 0.1;
    const marketValue = startingCashFlow / rate;

    const implied = impliedReturn({
      startingCashFlow,
      marketValue,
      initialGrowth: 0,
      terminalGrowth: 0,
      years: 8,
    });

    expect(implied).not.toBeNull();
    expect(implied!).toBeCloseTo(rate, 3);
  });

  it("prices a cheaper stock at a higher implied return", () => {
    const base = {
      startingCashFlow: 50,
      initialGrowth: 0.06,
      terminalGrowth: 0.025,
      years: 8,
    };
    const cheap = impliedReturn({ ...base, marketValue: 400 });
    const rich = impliedReturn({ ...base, marketValue: 1_200 });
    expect(cheap).not.toBeNull();
    expect(rich).not.toBeNull();
    expect(cheap!).toBeGreaterThan(rich!);
  });

  it("valueAtDiscountRate is the inverse of impliedReturn", () => {
    const input = {
      startingCashFlow: 80,
      marketValue: 1_000,
      initialGrowth: 0.08,
      terminalGrowth: 0.025,
      years: 8,
    };
    const rate = impliedReturn(input);
    expect(rate).not.toBeNull();
    expect(valueAtDiscountRate(input, rate!)).toBeCloseTo(1_000, -1);
  });
});

describe("terminalValue", () => {
  it("is last cash flow times (1+g) / (r-g)", () => {
    expect(terminalValue(100, 0.02, 0.1)).toBeCloseTo(100 * 1.02 / 0.08, 10);
  });
});

describe("presentValue", () => {
  it("discounts a single cash flow and terminal value one year", () => {
    expect(presentValue([110], 1_000, 0.1)).toBeCloseTo(110 / 1.1 + 1_000 / 1.1, 10);
  });
});

describe("conservativeGrowth", () => {
  it("haircuts and caps reported growth", () => {
    expect(conservativeGrowth(0.4)).toBeCloseTo(0.15 * 0.7, 10);
    expect(conservativeGrowth(0.1)).toBeCloseTo(0.07, 10);
  });

  it("floors a dip at zero instead of encoding perpetual decline", () => {
    expect(conservativeGrowth(-0.2)).toBe(0);
  });

  it("defaults when growth is missing", () => {
    expect(conservativeGrowth(null)).toBeCloseTo(0.03, 10);
  });
});
