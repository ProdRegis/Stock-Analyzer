import { describe, expect, it } from "vitest";
import {
  formatPValue,
  logGamma,
  regularizedIncompleteBeta,
  studentTTwoTailedP,
  tCrit95,
} from "./stats";

describe("logGamma", () => {
  it("matches known values of ln Γ", () => {
    expect(logGamma(1)).toBeCloseTo(0, 10);
    expect(logGamma(2)).toBeCloseTo(0, 10);
    expect(logGamma(3)).toBeCloseTo(Math.log(2), 8);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 8);
  });
});

describe("regularizedIncompleteBeta", () => {
  it("is 0 at x=0 and 1 at x=1", () => {
    expect(regularizedIncompleteBeta(0, 2, 2)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 2)).toBe(1);
  });

  it("is 0.5 at x=0.5 when a=b", () => {
    expect(regularizedIncompleteBeta(0.5, 3, 3)).toBeCloseTo(0.5, 8);
  });
});

describe("studentTTwoTailedP", () => {
  it("is 1 at t=0", () => {
    expect(studentTTwoTailedP(0, 30)).toBeCloseTo(1, 10);
  });

  it("recovers the textbook 5% critical values", () => {
    // Two-tailed 5% points: t_0.975,30 ≈ 2.042, t_0.975,∞ ≈ 1.960
    expect(studentTTwoTailedP(2.042, 30)).toBeCloseTo(0.05, 2);
    expect(studentTTwoTailedP(1.96, 10_000)).toBeCloseTo(0.05, 2);
  });

  it("shrinks toward 0 as |t| grows", () => {
    expect(studentTTwoTailedP(8, 40)).toBeLessThan(0.001);
    expect(studentTTwoTailedP(8, 40)).toBeGreaterThan(0);
  });

  it("is even in t", () => {
    expect(studentTTwoTailedP(-2.042, 30)).toBeCloseTo(
      studentTTwoTailedP(2.042, 30),
      12
    );
  });
});

describe("tCrit95", () => {
  it("approaches the normal quantile as df grows", () => {
    expect(tCrit95(10_000)).toBeCloseTo(1.96, 3);
  });

  it("is larger than 1.96 for small samples", () => {
    expect(tCrit95(30)).toBeGreaterThan(1.96);
    expect(tCrit95(30)).toBeCloseTo(2.042, 2);
  });
});

describe("formatPValue", () => {
  it("uses a floor for very small p", () => {
    expect(formatPValue(1e-8)).toBe("< 0.001");
  });
});
