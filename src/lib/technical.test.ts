import { describe, expect, it } from "vitest";
import {
  computeATR,
  computeLongStopLoss,
  computeMovingAverages,
  computeRSI,
  computeShortStopLoss,
  findResistanceLevels,
  findSupportLevels,
  sma,
} from "./technical";
import type { PricePoint } from "./types";

function day(index: number): string {
  const date = new Date(Date.UTC(2024, 0, 1 + index));
  return date.toISOString().split("T")[0];
}

/** Bar whose true range is exactly `range`, given the previous close. */
function rangeBar(index: number, close: number, range: number): PricePoint {
  return {
    date: day(index),
    open: close,
    high: close + range / 2,
    low: close - range / 2,
    close,
    volume: 1_000_000,
  };
}

function flatSeries(length: number, price: number): PricePoint[] {
  return Array.from({ length }, (_, index) => rangeBar(index, price, 1));
}

describe("sma", () => {
  it("averages the trailing window", () => {
    expect(sma([1, 2, 3, 4], 4)).toBeCloseTo(2.5, 10);
    expect(sma([1, 2, 3, 4], 2)).toBeCloseTo(3.5, 10);
  });

  it("returns null when there is not enough history", () => {
    expect(sma([1, 2], 3)).toBeNull();
  });

  it("reports the longer averages as null until enough bars exist", () => {
    const prices = Array.from({ length: 60 }, (_, i) => 100 + i);
    const averages = computeMovingAverages(prices);

    expect(averages.sma20).not.toBeNull();
    expect(averages.sma50).not.toBeNull();
    expect(averages.sma200).toBeNull();
  });
});

describe("computeRSI", () => {
  it("is 100 when every period gains", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(computeRSI(closes)).toBe(100);
  });

  it("is 0 when every period loses", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 200 - i);
    expect(computeRSI(closes)).toBeCloseTo(0, 10);
  });

  it("is neutral for a flat series rather than maximally overbought", () => {
    expect(computeRSI(new Array(30).fill(100))).toBe(50);
  });

  it("falls back to neutral without enough data", () => {
    expect(computeRSI([100, 101, 102])).toBe(50);
  });

  it("sits between the extremes for a mixed series", () => {
    const closes = [
      100, 102, 101, 103, 102, 104, 103, 105, 104, 106, 105, 107, 106, 108, 107,
      109,
    ];
    const rsi = computeRSI(closes);

    expect(rsi).toBeGreaterThan(0);
    expect(rsi).toBeLessThan(100);
  });
});

describe("computeATR", () => {
  it("equals the constant true range when every bar has the same range", () => {
    // Flat closes with a 1.00 high-low spread make every true range exactly 1.
    expect(computeATR(flatSeries(40, 100))).toBeCloseTo(1, 10);
  });

  it("scales with the size of the range", () => {
    const wide = Array.from({ length: 40 }, (_, i) => rangeBar(i, 100, 3));
    expect(computeATR(wide)).toBeCloseTo(3, 10);
  });

  it("averages plainly when there are fewer bars than the period", () => {
    const history = [
      rangeBar(0, 100, 1),
      rangeBar(1, 100, 1),
      rangeBar(2, 100, 3),
    ];
    // Two true ranges, 1 and 3, and no room for Wilder smoothing.
    expect(computeATR(history, 14)).toBeCloseTo(2, 10);
  });

  it("is zero without at least two bars", () => {
    expect(computeATR([rangeBar(0, 100, 1)])).toBe(0);
    expect(computeATR([])).toBe(0);
  });

  it("counts a gap beyond the bar's own range", () => {
    const history: PricePoint[] = [
      { date: day(0), open: 100, high: 100, low: 100, close: 100, volume: 1 },
      { date: day(1), open: 110, high: 111, low: 110, close: 110, volume: 1 },
    ];
    // The 1.00 intraday range is dwarfed by the 11.00 gap from the prior close.
    expect(computeATR(history)).toBeCloseTo(11, 10);
  });
});

describe("support and resistance", () => {
  const history: PricePoint[] = Array.from({ length: 60 }, (_, i) => {
    // A single pronounced peak at index 30 and trough at index 45.
    let close = 100;
    if (i === 30) close = 130;
    if (i === 45) close = 70;
    return {
      date: day(i),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000,
    };
  });

  it("finds the isolated peak as resistance", () => {
    const levels = findResistanceLevels(history);
    expect(levels.some((level) => Math.abs(level.price - 131) < 1)).toBe(true);
  });

  it("finds the isolated trough as support", () => {
    const levels = findSupportLevels(history);
    expect(levels.some((level) => Math.abs(level.price - 69) < 1)).toBe(true);
  });

  it("returns nothing for a perfectly flat series", () => {
    expect(findResistanceLevels(flatSeries(60, 100))).toEqual([]);
    expect(findSupportLevels(flatSeries(60, 100))).toEqual([]);
  });
});

describe("stop-loss selection", () => {
  const history: PricePoint[] = Array.from({ length: 120 }, (_, i) => {
    const close = 100 + Math.sin(i / 6) * 4;
    return {
      date: day(i),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000,
    };
  });

  const entry = history[history.length - 1].close;

  const nearestSupport =
    findSupportLevels(history)
      .filter((level) => level.price < entry)
      .sort((a, b) => b.price - a.price)[0] ?? null;

  const nearestResistance =
    findResistanceLevels(history)
      .filter((level) => level.price > entry)
      .sort((a, b) => a.price - b.price)[0] ?? null;

  it("places a long stop below the entry and within the allowed band", () => {
    const plan = computeLongStopLoss(entry, nearestSupport, history);

    expect(plan.stopLossPrice).toBeLessThan(entry);

    const distance = (entry - plan.stopLossPrice) / entry;
    expect(distance).toBeGreaterThanOrEqual(0.005);
    expect(distance).toBeLessThanOrEqual(0.15);
  });

  it("places a short stop above the entry and within the allowed band", () => {
    const plan = computeShortStopLoss(entry, nearestResistance, history);

    expect(plan.stopLossPrice).toBeGreaterThan(entry);

    const distance = (plan.stopLossPrice - entry) / entry;
    expect(distance).toBeGreaterThanOrEqual(0.005);
    expect(distance).toBeLessThanOrEqual(0.15);
  });

  it("still produces a valid stop when no support level exists", () => {
    const plan = computeLongStopLoss(entry, null, history);

    expect(plan.stopLossPrice).toBeLessThan(entry);
    expect((entry - plan.stopLossPrice) / entry).toBeLessThanOrEqual(0.15);
  });

  it("explains which method won and why", () => {
    const plan = computeLongStopLoss(entry, nearestSupport, history);

    expect(plan.stopLossWinningMethod).toBeTruthy();
    expect(plan.stopLossReasons.length).toBeGreaterThan(0);
    expect(
      plan.stopLossReasons.some((reason) => reason.category === "selection")
    ).toBe(true);
  });

  it("reports the loss percentage consistently with the stop price", () => {
    const plan = computeLongStopLoss(entry, nearestSupport, history);
    const implied = ((entry - plan.stopLossPrice) / entry) * 100;

    expect(plan.stopLossPercent).toBeCloseTo(implied, 1);
  });

  it("keeps long and short stops on opposite sides of the same entry", () => {
    const long = computeLongStopLoss(entry, nearestSupport, history);
    const short = computeShortStopLoss(entry, nearestResistance, history);

    expect(long.stopLossPrice).toBeLessThan(short.stopLossPrice);
  });
});
