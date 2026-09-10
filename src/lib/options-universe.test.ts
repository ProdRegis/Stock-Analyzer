import { describe, expect, it } from "vitest";
import {
  gradeLiquidity,
  pickStarter,
  sortUniverseRows,
  universeScore,
} from "./options-universe";
import type { OptionsScanRow } from "./types";

function row(partial: Partial<OptionsScanRow>): OptionsScanRow {
  return {
    symbol: "AAA",
    name: "Aaa",
    spot: 100,
    atmIv: 0.3,
    rv30: 0.2,
    ivRvRatio: 1.5,
    vrp: 0.1,
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
    atmVolume: 4000,
    ivPercentile: 0.7,
    liquidity: "tight",
    ...partial,
  };
}

describe("gradeLiquidity", () => {
  it("calls a thin book thin even if the spread looks tight", () => {
    expect(gradeLiquidity(0.02, 80)).toBe("thin");
    expect(gradeLiquidity(0.02, null)).toBe("thin");
  });

  it("calls a wide ATM spread a tax even with size", () => {
    expect(gradeLiquidity(0.2, 12_000)).toBe("wide");
  });

  it("reserves tight for four-figure OI and a small spread", () => {
    expect(gradeLiquidity(0.04, 2500)).toBe("tight");
    expect(gradeLiquidity(0.08, 2500)).toBe("workable");
  });
});

describe("sortUniverseRows", () => {
  it("puts a liquid rich-IV name ahead of a cheap illiquid name", () => {
    const rows = sortUniverseRows([
      row({
        symbol: "THIN",
        ivRvRatio: 2.2,
        liquidity: "thin",
        atmOpenInterest: 40,
      }),
      row({
        symbol: "RICH",
        ivRvRatio: 1.6,
        liquidity: "tight",
        stance: "sell_vol",
      }),
      row({
        symbol: "WAIT",
        ivRvRatio: 1.02,
        stance: "wait",
        liquidity: "tight",
      }),
    ]);
    expect(rows.map((item) => item.symbol)).toEqual(["RICH", "WAIT", "THIN"]);
    expect(universeScore(rows[0])).toBeGreaterThan(universeScore(rows[1]));
  });

  it("will not start someone on an earnings lottery", () => {
    const starter = pickStarter([
      row({
        symbol: "PRINT",
        stance: "event_vol",
        earningsInWindow: true,
        ivRvRatio: 1.8,
      }),
      row({
        symbol: "SPY",
        stance: "sell_vol",
        ivRvRatio: 1.3,
      }),
    ]);
    expect(starter?.symbol).toBe("SPY");
  });
});
