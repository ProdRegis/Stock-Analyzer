import { describe, expect, it } from "vitest";
import {
  closeToCloseVol,
  expectedMove,
  garmanKlassVol,
  parkinsonVol,
  percentileRank,
  realizedVolWindow,
  ruleOf16DailyMove,
  yangZhangVol,
} from "./realized-vol";
import type { PricePoint } from "./types";

function bar(
  date: string,
  open: number,
  high: number,
  low: number,
  close: number
): PricePoint {
  return { date, open, high, low, close, volume: 1_000 };
}

/** Geometric Brownian sample with known daily sigma = 0.01 (≈ 15.87% ann.). */
function gbmPath(n: number, seed = 1): PricePoint[] {
  let x = seed;
  const rand = () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
  const boxMuller = () => {
    const u = Math.max(1e-12, rand());
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const bars: PricePoint[] = [];
  let close = 100;
  for (let i = 0; i < n; i++) {
    const z = boxMuller();
    const open = close * Math.exp(0.004 * boxMuller());
    const next = close * Math.exp(-0.5 * 0.01 * 0.01 + 0.01 * z);
    const high = Math.max(open, next) * (1 + 0.003 * Math.abs(boxMuller()));
    const low = Math.min(open, next) * (1 - 0.003 * Math.abs(boxMuller()));
    bars.push(bar(`2024-01-${String((i % 28) + 1).padStart(2, "0")}`, open, high, low, next));
    close = next;
  }
  return bars;
}

describe("ruleOf16DailyMove", () => {
  it("is annual vol divided by 16", () => {
    expect(ruleOf16DailyMove(0.32)).toBeCloseTo(0.02, 10);
    expect(ruleOf16DailyMove(0.8)).toBeCloseTo(0.05, 10);
    expect(ruleOf16DailyMove(0)).toBeNull();
  });
});

describe("expectedMove", () => {
  it("scales with sqrt of calendar time", () => {
    const month = expectedMove(100, 0.2, 30)!;
    const twoMonth = expectedMove(100, 0.2, 60)!;
    expect(twoMonth / month).toBeCloseTo(Math.sqrt(2), 5);
  });
});

describe("closeToCloseVol", () => {
  it("annualizes a constant 1% daily log move near √252", () => {
    const bars: PricePoint[] = [];
    let close = 100;
    for (let i = 0; i < 40; i++) {
      close *= Math.exp(i % 2 === 0 ? 0.01 : -0.01);
      bars.push(bar(`d${i}`, close, close, close, close));
    }
    const vol = closeToCloseVol(bars)!;
    expect(vol).toBeGreaterThan(0.15);
    expect(vol).toBeLessThan(0.17);
  });

  it("returns null on a tiny sample", () => {
    expect(closeToCloseVol([bar("a", 1, 1, 1, 1), bar("b", 1, 1, 1, 1)])).toBeNull();
  });
});

describe("range estimators", () => {
  it("stay in a sane band on a GBM path", () => {
    const path = gbmPath(80);
    const cc = closeToCloseVol(path)!;
    const pk = parkinsonVol(path)!;
    const gk = garmanKlassVol(path)!;
    const yz = yangZhangVol(path)!;
    for (const vol of [cc, pk, gk, yz]) {
      expect(vol).toBeGreaterThan(0.05);
      expect(vol).toBeLessThan(0.5);
    }
  });
});

describe("percentileRank", () => {
  it("is 1 when the value is the max and ~0.5 at the median", () => {
    const sample = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    expect(percentileRank(sample, 1)).toBe(1);
    expect(percentileRank(sample, 0.55)).toBeCloseTo(0.5, 10);
  });
});

describe("realizedVolWindow", () => {
  it("prefers Yang–Zhang when the bars support it", () => {
    const window = realizedVolWindow(gbmPath(40), 30);
    expect(window.estimator).toBe("yang-zhang");
    expect(window.preferred).toBe(window.yangZhang);
    expect(window.lookbackDays).toBe(30);
  });
});
