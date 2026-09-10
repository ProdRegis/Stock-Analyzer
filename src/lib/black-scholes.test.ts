import { describe, expect, it } from "vitest";
import {
  blackScholesGreeks,
  blackScholesPrice,
  impliedVolatility,
  intrinsicValue,
  midPrice,
  normCdf,
  normPdf,
} from "./black-scholes";

describe("normCdf", () => {
  it("is 0.5 at zero and matches known normal tails", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it("pairs with a unit-integral pdf at zero", () => {
    expect(normPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 10);
  });
});

describe("intrinsicValue", () => {
  it("is max(S−K, 0) for calls and max(K−S, 0) for puts", () => {
    expect(intrinsicValue("call", 105, 100)).toBe(5);
    expect(intrinsicValue("call", 95, 100)).toBe(0);
    expect(intrinsicValue("put", 95, 100)).toBe(5);
    expect(intrinsicValue("put", 105, 100)).toBe(0);
  });
});

describe("blackScholesPrice", () => {
  const atm = {
    spot: 100,
    strike: 100,
    timeYears: 1,
    rate: 0.05,
    dividendYield: 0,
    volatility: 0.2,
  };

  it("matches the textbook ATM European call and put", () => {
    const call = blackScholesPrice({ ...atm, type: "call" });
    const put = blackScholesPrice({ ...atm, type: "put" });
    expect(call).not.toBeNull();
    expect(put).not.toBeNull();
    expect(call!).toBeCloseTo(10.4505835722, 4);
    expect(put!).toBeCloseTo(5.5735260223, 4);
  });

  it("obeys put-call parity", () => {
    const call = blackScholesPrice({ ...atm, type: "call" })!;
    const put = blackScholesPrice({ ...atm, type: "put" })!;
    const parity = atm.spot - atm.strike * Math.exp(-atm.rate * atm.timeYears);
    expect(call - put).toBeCloseTo(parity, 8);
  });

  it("raises both call and put prices when volatility rises", () => {
    const quietCall = blackScholesPrice({ ...atm, type: "call", volatility: 0.15 })!;
    const loudCall = blackScholesPrice({ ...atm, type: "call", volatility: 0.35 })!;
    const quietPut = blackScholesPrice({ ...atm, type: "put", volatility: 0.15 })!;
    const loudPut = blackScholesPrice({ ...atm, type: "put", volatility: 0.35 })!;
    expect(loudCall).toBeGreaterThan(quietCall);
    expect(loudPut).toBeGreaterThan(quietPut);
  });
});

describe("blackScholesGreeks", () => {
  const atm = {
    type: "call" as const,
    spot: 100,
    strike: 100,
    timeYears: 1,
    rate: 0.05,
    dividendYield: 0,
    volatility: 0.2,
  };

  it("puts ATM call delta near 0.64 and put delta near delta−1", () => {
    const call = blackScholesGreeks(atm)!;
    const put = blackScholesGreeks({ ...atm, type: "put" })!;
    expect(call.delta).toBeCloseTo(0.6368, 3);
    expect(put.delta).toBeCloseTo(call.delta - 1, 6);
    expect(call.gamma).toBeCloseTo(put.gamma, 8);
    expect(call.vega).toBeCloseTo(put.vega, 8);
  });

  it("moves price by about vega when IV shifts one point", () => {
    const base = blackScholesGreeks(atm)!;
    const up = blackScholesPrice({ ...atm, volatility: 0.21 })!;
    expect(up - base.price).toBeCloseTo(base.vega, 2);
  });
});

describe("impliedVolatility", () => {
  it("recovers the vol that produced a model price", () => {
    const input = {
      type: "call" as const,
      spot: 100,
      strike: 100,
      timeYears: 0.5,
      rate: 0.04,
      dividendYield: 0.01,
      volatility: 0.27,
    };
    const price = blackScholesPrice(input)!;
    const iv = impliedVolatility({ ...input, price });
    expect(iv).not.toBeNull();
    expect(iv!).toBeCloseTo(0.27, 4);
  });

  it("returns null for a non-positive premium", () => {
    expect(
      impliedVolatility({
        type: "call",
        spot: 100,
        strike: 100,
        timeYears: 0.5,
        rate: 0.04,
        dividendYield: 0,
        price: 0,
      })
    ).toBeNull();
  });
});

describe("midPrice", () => {
  it("averages a live bid/ask and falls back to last", () => {
    expect(midPrice(1.2, 1.4, 1.9)).toBeCloseTo(1.3, 10);
    expect(midPrice(null, null, 2.1)).toBeCloseTo(2.1, 10);
    expect(midPrice(null, null, null)).toBeNull();
  });
});
