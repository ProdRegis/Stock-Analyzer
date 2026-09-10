import { describe, expect, it } from "vitest";
import {
  expirationStats,
  ironCondor,
  longStraddle,
  shortPut,
} from "./options-structures";
import {
  integrateExpiration,
  rankStructures,
  recommendForBeginner,
  scanEdge,
  selectPicks,
  sortScanRows,
} from "./options-rank";
import type { OptionStructureView, OptionsScanRow } from "./types";

function viewFrom(
  id: OptionStructureView["id"],
  name: string,
  legs: ReturnType<typeof longStraddle>,
  extras: Partial<OptionStructureView> = {}
): OptionStructureView {
  const stats = expirationStats(legs);
  return {
    id,
    name,
    thesis: "",
    debitCredit: stats.debitCredit,
    netPremium: stats.netPremium,
    multiplier: 100,
    maxProfit: stats.maxProfit,
    maxLoss: stats.maxLoss,
    breakevens: stats.breakevens,
    capitalAtRisk: stats.capitalAtRisk,
    definedRisk: stats.definedRisk,
    recommended: false,
    legs: legs.map((leg) => ({
      type: leg.type,
      side: leg.side,
      strike: leg.strike,
      premium: leg.premium,
      delta: null,
      iv: 0.25,
    })),
    payoff: stats.payoff,
    netDelta: extras.netDelta ?? 0,
    netGamma: extras.netGamma ?? 0,
    netTheta: extras.netTheta ?? 0,
    netVega: extras.netVega ?? 0,
    ...extras,
  };
}

const env = {
  spot: 100,
  timeYears: 30 / 365.25,
  rate: 0.04,
  dividendYield: 0,
  atmIv: 0.25,
  rv30: 0.18,
  stance: "sell_vol" as const,
};

describe("integrateExpiration", () => {
  it("gives a short iron condor a higher chance of profit than a long straddle", () => {
    const condor = ironCondor({
      longPutStrike: 90,
      longPutPremium: 0.8,
      shortPutStrike: 95,
      shortPutPremium: 1.8,
      shortCallStrike: 105,
      shortCallPremium: 1.7,
      longCallStrike: 110,
      longCallPremium: 0.7,
    });
    const straddle = longStraddle(100, 3, 3);
    const condorStats = integrateExpiration(
      condor,
      100,
      0.25,
      30 / 365.25,
      0.04
    );
    const straddleStats = integrateExpiration(
      straddle,
      100,
      0.25,
      30 / 365.25,
      0.04
    );
    expect(condorStats).not.toBeNull();
    expect(straddleStats).not.toBeNull();
    expect(condorStats!.pop).toBeGreaterThan(straddleStats!.pop);
    expect(condorStats!.pop).toBeGreaterThan(0.5);
    expect(straddleStats!.pop).toBeLessThan(0.5);
    const blended =
      (condorStats!.typicalWin ?? 0) * condorStats!.pop +
      (condorStats!.typicalLoss ?? 0) * (1 - condorStats!.pop);
    expect(blended).toBeCloseTo(condorStats!.expectedPnl, 6);
    expect(condorStats!.typicalWin).toBeGreaterThan(0);
    expect(condorStats!.typicalLoss).toBeLessThan(0);
  });
});

describe("selectPicks", () => {
  const condor = viewFrom(
    "iron_condor",
    "Iron condor",
    ironCondor({
      longPutStrike: 90,
      longPutPremium: 0.8,
      shortPutStrike: 95,
      shortPutPremium: 1.8,
      shortCallStrike: 105,
      shortCallPremium: 1.7,
      longCallStrike: 110,
      longCallPremium: 0.7,
    }),
    { netVega: -0.2, definedRisk: true }
  );
  const straddle = viewFrom(
    "long_straddle",
    "Long straddle",
    longStraddle(100, 3, 3),
    { netVega: 0.25, definedRisk: true }
  );

  it("picks the condor as best and highest-chance when selling vol", () => {
    const ranked = rankStructures([condor, straddle], env);
    const picks = selectPicks(ranked, "sell_vol");
    expect(picks.best?.structure.id).toBe("iron_condor");
    expect(picks.highestChance?.structure.id).toBe("iron_condor");
    expect(picks.best?.align).toBe("match");
  });

  it("does not crown a best structure in the no-trade band", () => {
    const ranked = rankStructures([condor, straddle], {
      ...env,
      stance: "wait",
      rv30: 0.24,
    });
    const picks = selectPicks(ranked, "wait");
    expect(picks.best).toBeNull();
    expect(picks.highestChance).not.toBeNull();
  });

  it("prefers the long straddle when buying vol and RV is rich vs IV", () => {
    const ranked = rankStructures([condor, straddle], {
      ...env,
      stance: "buy_vol",
      atmIv: 0.18,
      rv30: 0.32,
    });
    const picks = selectPicks(ranked, "buy_vol");
    expect(picks.best?.structure.id).toBe("long_straddle");
    expect(picks.highestReturn?.structure.id).toBe("long_straddle");
  });

  it("drops Level 3 tickets when the desk is set to Robinhood Level 2", () => {
    const ranked = rankStructures([condor, straddle], env);
    const picks = selectPicks(ranked, "sell_vol", 2);
    expect(picks.best).toBeNull();
    expect(picks.highestChance).toBeNull();
  });
});

describe("recommendForBeginner", () => {
  const condor = viewFrom(
    "iron_condor",
    "Iron condor",
    ironCondor({
      longPutStrike: 90,
      longPutPremium: 0.8,
      shortPutStrike: 95,
      shortPutPremium: 1.8,
      shortCallStrike: 105,
      shortCallPremium: 1.7,
      longCallStrike: 110,
      longCallPremium: 0.7,
    }),
    { netVega: -0.2, definedRisk: true }
  );
  const straddle = viewFrom(
    "long_straddle",
    "Long straddle",
    longStraddle(100, 3, 3),
    { netVega: 0.25, definedRisk: true }
  );

  it("recommends the condor when selling vol — not the high-payoff long straddle", () => {
    const ranked = rankStructures([condor, straddle], env);
    const rec = recommendForBeginner(ranked, "sell_vol");
    expect(rec.action).toBe("consider");
    expect(rec.ranked?.structure.id).toBe("iron_condor");
    expect(rec.ranked?.expectedPnl).toBeGreaterThan(0);
  });

  it("sits out the no-trade band instead of crowning a winner", () => {
    const ranked = rankStructures([condor, straddle], {
      ...env,
      stance: "wait",
      rv30: 0.24,
    });
    const rec = recommendForBeginner(ranked, "wait");
    expect(rec.action).toBe("stand_aside");
    expect(rec.ranked).toBeNull();
  });

  it("sits out event vol — the implied move is not a calculated edge", () => {
    const ranked = rankStructures([condor, straddle], {
      ...env,
      stance: "event_vol",
      rv30: 0.4,
    });
    const rec = recommendForBeginner(ranked, "event_vol");
    expect(rec.action).toBe("stand_aside");
    expect(rec.ranked).toBeNull();
  });

  it("does not pick the high-win-rate condor when buying vol", () => {
    const ranked = rankStructures([condor, straddle], {
      ...env,
      stance: "buy_vol",
      atmIv: 0.18,
      rv30: 0.32,
    });
    const naive =
      [...ranked].sort((a, b) => {
        const scoreA = (a.pop ?? 0) * (a.structure.maxProfit ?? 0);
        const scoreB = (b.pop ?? 0) * (b.structure.maxProfit ?? 0);
        return scoreB - scoreA;
      })[0];
    expect(naive?.structure.id).toBe("iron_condor");
    const rec = recommendForBeginner(ranked, "buy_vol");
    expect(rec.action).toBe("consider");
    expect(rec.ranked?.structure.id).toBe("long_straddle");
  });

  it("sits out a cheap-vol view at Level 2 instead of forcing a long call", () => {
    const ranked = rankStructures([condor, straddle], {
      ...env,
      stance: "buy_vol",
      atmIv: 0.18,
      rv30: 0.32,
    });
    const rec = recommendForBeginner(ranked, "buy_vol", 2);
    expect(rec.action).toBe("stand_aside");
    expect(rec.ranked).toBeNull();
    expect(rec.why).toMatch(/level 2/i);
  });

  it("can recommend a cash-secured put at Level 2 when selling vol", () => {
    const csp = viewFrom(
      "cash_secured_put",
      "Cash-secured put",
      shortPut(95, 3),
      { netVega: -0.15, definedRisk: false }
    );
    const ranked = rankStructures([condor, straddle, csp], env);
    const rec = recommendForBeginner(ranked, "sell_vol", 2);
    expect(rec.action).toBe("consider");
    expect(rec.ranked?.structure.id).toBe("cash_secured_put");
    expect(rec.why).toMatch(/cash-secured put/i);
  });
});

describe("sortScanRows", () => {
  const base: OptionsScanRow = {
    symbol: "AAA",
    name: "Aaa",
    spot: 10,
    atmIv: 0.4,
    rv30: 0.2,
    ivRvRatio: 2,
    vrp: 0.2,
    termShape: "contango",
    expiration: "2026-10-02",
    dte: 28,
    earningsDate: null,
    earningsInWindow: false,
    stance: "sell_vol",
    preferredStructure: "iron_condor",
    reason: "",
    skipped: null,
    atmSpreadPct: 0.03,
    atmOpenInterest: 8000,
    atmVolume: 2000,
    ivPercentile: 0.7,
    liquidity: "tight",
  };

  it("puts the richest IV/RV actionable name first", () => {
    const rows = sortScanRows([
      { ...base, symbol: "WAIT", ivRvRatio: 1.02, stance: "wait" },
      { ...base, symbol: "MILD", ivRvRatio: 1.2, stance: "sell_vol" },
      { ...base, symbol: "RICH", ivRvRatio: 1.8, stance: "sell_vol" },
    ]);
    expect(rows.map((row) => row.symbol)).toEqual(["RICH", "MILD", "WAIT"]);
    expect(scanEdge(rows[0])).toBeGreaterThan(scanEdge(rows[1]));
  });
});
