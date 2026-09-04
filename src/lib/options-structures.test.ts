import { describe, expect, it } from "vitest";
import {
  callDebitSpread,
  expirationPnl,
  expirationStats,
  ironCondor,
  longCall,
  longPut,
  longStraddle,
  putCreditSpread,
  shortCall,
} from "./options-structures";

describe("expirationPnl", () => {
  it("matches the course long-call example (100-strike, $3 premium)", () => {
    const legs = longCall(100, 3);
    expect(expirationPnl(110, legs)).toBeCloseTo(700, 6);
    expect(expirationPnl(95, legs)).toBeCloseTo(-300, 6);
    expect(expirationPnl(100, legs)).toBeCloseTo(-300, 6);
    expect(expirationPnl(103, legs)).toBeCloseTo(0, 6);
  });

  it("matches the course long-put example", () => {
    const legs = longPut(100, 3);
    expect(expirationPnl(90, legs)).toBeCloseTo(700, 6);
    expect(expirationPnl(105, legs)).toBeCloseTo(-300, 6);
    expect(expirationPnl(97, legs)).toBeCloseTo(0, 6);
  });

  it("reverses the long call for a short call", () => {
    const long = longCall(100, 3);
    const short = shortCall(100, 3);
    expect(expirationPnl(110, short)).toBeCloseTo(-expirationPnl(110, long), 10);
  });
});

describe("expirationStats", () => {
  it("caps a debit call spread and finds one breakeven", () => {
    const stats = expirationStats(callDebitSpread(100, 4, 110, 1.5));
    expect(stats.debitCredit).toBe("debit");
    expect(stats.definedRisk).toBe(true);
    expect(stats.netPremium).toBeCloseTo(2.5, 8);
    expect(stats.maxLoss).toBeCloseTo(-250, 4);
    expect(stats.maxProfit).toBeCloseTo(750, 4);
    expect(stats.breakevens[0]).toBeCloseTo(102.5, 4);
  });

  it("treats a short call as undefined upside risk", () => {
    const stats = expirationStats(shortCall(100, 3));
    expect(stats.debitCredit).toBe("credit");
    expect(stats.maxProfit).toBeCloseTo(300, 4);
    expect(stats.maxLoss).toBeNull();
    expect(stats.definedRisk).toBe(false);
  });

  it("gives an iron condor a tent with two breakevens", () => {
    const stats = expirationStats(
      ironCondor({
        longPutStrike: 90,
        longPutPremium: 0.8,
        shortPutStrike: 95,
        shortPutPremium: 1.8,
        shortCallStrike: 105,
        shortCallPremium: 1.7,
        longCallStrike: 110,
        longCallPremium: 0.7,
      })
    );
    expect(stats.definedRisk).toBe(true);
    expect(stats.debitCredit).toBe("credit");
    expect(stats.breakevens).toHaveLength(2);
    expect(stats.maxProfit).toBeGreaterThan(0);
    expect(stats.maxLoss).toBeLessThan(0);
  });

  it("puts a long straddle's breakevens at strike ± debit", () => {
    const stats = expirationStats(longStraddle(100, 3, 3));
    expect(stats.breakevens).toHaveLength(2);
    expect(Math.min(...stats.breakevens)).toBeCloseTo(94, 4);
    expect(Math.max(...stats.breakevens)).toBeCloseTo(106, 4);
    expect(stats.maxLoss).toBeCloseTo(-600, 4);
    expect(stats.maxProfit).toBeNull();
  });
});

describe("putCreditSpread", () => {
  it("profits if price stays above the short put", () => {
    const legs = putCreditSpread(100, 2.5, 95, 1);
    expect(expirationPnl(110, legs)).toBeCloseTo(150, 4);
    expect(expirationPnl(90, legs)).toBeCloseTo(-350, 4);
  });
});
