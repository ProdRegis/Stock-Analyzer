import { describe, expect, it } from "vitest";
import {
  classifyTermStructure,
  forwardVolatility,
  ivRvRatio,
  varianceRiskPremium,
  volStance,
} from "./options-surface";

describe("forwardVolatility", () => {
  it("recovers the course 30-to-60 day example", () => {
    const fwd = forwardVolatility(0.22, 30 / 365.25, 0.28, 60 / 365.25);
    expect(fwd).not.toBeNull();
    expect(fwd!).toBeCloseTo(0.329, 2);
  });

  it("returns null when far variance is below near variance", () => {
    expect(forwardVolatility(0.4, 0.1, 0.2, 0.2)).toBeNull();
  });
});

describe("classifyTermStructure", () => {
  it("calls an upward ATM IV curve contango", () => {
    expect(
      classifyTermStructure([
        { expiration: "a", dte: 14, atmIv: 0.2 },
        { expiration: "b", dte: 60, atmIv: 0.26 },
      ])
    ).toBe("contango");
  });

  it("calls an inverted curve backwardation", () => {
    expect(
      classifyTermStructure([
        { expiration: "a", dte: 7, atmIv: 0.55 },
        { expiration: "b", dte: 90, atmIv: 0.28 },
      ])
    ).toBe("backwardation");
  });
});

describe("ivRvRatio", () => {
  it("is IV divided by RV", () => {
    expect(ivRvRatio(0.3, 0.2)).toBeCloseTo(1.5, 10);
    expect(ivRvRatio(0.3, 0)).toBeNull();
  });
});

describe("volStance", () => {
  const liquid = {
    atmSpreadPct: 0.03,
    atmOpenInterest: 5_000,
    earningsInWindow: false,
    hasDefinedRiskStrikes: true,
    ivPercentile: 0.35,
    term: "contango" as const,
  };

  it("sells defined-risk vol when IV is rich vs RV in contango", () => {
    const result = volStance({
      ...liquid,
      atmIv: 0.4,
      rv30: 0.28,
    });
    expect(result.stance).toBe("sell_vol");
    expect(result.preferredStructure).toBe("iron_condor");
    expect(result.ivRvRatio).toBeCloseTo(0.4 / 0.28, 6);
    expect(varianceRiskPremium(0.4, 0.28)).toBeCloseTo(0.12, 10);
    expect(result.reasons.some((row) => /theta is not the edge/i.test(row))).toBe(
      true
    );
  });

  it("buys vol when IV is cheap vs recent realized", () => {
    const result = volStance({
      ...liquid,
      atmIv: 0.18,
      rv30: 0.28,
    });
    expect(result.stance).toBe("buy_vol");
    expect(result.preferredStructure).toBe("long_straddle");
  });

  it("waits in the no-trade IV/RV band", () => {
    const result = volStance({
      ...liquid,
      atmIv: 0.3,
      rv30: 0.29,
    });
    expect(result.stance).toBe("wait");
    expect(result.preferredStructure).toBe("none");
  });

  it("treats earnings inside the window as event vol, not a VRP sale", () => {
    const result = volStance({
      ...liquid,
      atmIv: 0.5,
      rv30: 0.3,
      earningsInWindow: true,
    });
    expect(result.stance).toBe("event_vol");
    expect(result.preferredStructure).toBe("long_straddle");
    expect(result.reasons.some((row) => /event vol/i.test(row))).toBe(true);
    expect(
      result.reasons.some((row) => /robinhood level 3 long straddle/i.test(row))
    ).toBe(true);
  });

  it("still flags event vol when IV is cheap versus RV", () => {
    const result = volStance({
      ...liquid,
      atmIv: 0.18,
      rv30: 0.28,
      earningsInWindow: true,
    });
    expect(result.stance).toBe("event_vol");
    expect(result.preferredStructure).toBe("long_straddle");
  });

  it("does not treat inverted term structure as vanilla VRP", () => {
    const result = volStance({
      ...liquid,
      atmIv: 0.5,
      rv30: 0.3,
      term: "backwardation",
    });
    expect(result.stance).toBe("wait");
  });

  it("waits when the chain is illiquid even if IV looks rich", () => {
    const result = volStance({
      ...liquid,
      atmIv: 0.5,
      rv30: 0.3,
      atmSpreadPct: 0.4,
      atmOpenInterest: 12,
    });
    expect(result.stance).toBe("wait");
  });
});
