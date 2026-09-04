import { describe, expect, it } from "vitest";
import {
  customStructureView,
  structureMatchesStance,
  toggleDraftLeg,
  vegaWeightedIv,
} from "./options-builder";
import type { OptionContract } from "./types";

function contract(
  type: "call" | "put",
  strike: number,
  extras: Partial<OptionContract> = {}
): OptionContract {
  return {
    contractSymbol: `${type}-${strike}`,
    type,
    strike,
    bid: 2,
    ask: 2.2,
    last: 2.1,
    mid: 2.1,
    spread: 0.2,
    spreadPct: 0.1,
    volume: 100,
    openInterest: 500,
    yahooIv: 0.3,
    iv: 0.3,
    ivSource: "inverted",
    delta: type === "call" ? 0.5 : -0.5,
    gamma: 0.02,
    theta: -0.03,
    vega: 0.12,
    rho: 0.01,
    intrinsic: 0,
    extrinsic: 2.1,
    inTheMoney: false,
    illiquid: false,
    ...extras,
  };
}

describe("toggleDraftLeg", () => {
  it("adds, flips side, then removes", () => {
    const added = toggleDraftLeg([], {
      type: "call",
      strike: 100,
      side: "long",
    });
    expect(added).toEqual([
      { type: "call", strike: 100, side: "long" },
    ]);
    const flipped = toggleDraftLeg(added, {
      type: "call",
      strike: 100,
      side: "short",
    });
    expect(flipped[0].side).toBe("short");
    expect(
      toggleDraftLeg(flipped, { type: "call", strike: 100, side: "short" })
    ).toEqual([]);
  });
});

describe("structureMatchesStance", () => {
  it("matches short vol only when vega is short and risk is defined", () => {
    expect(structureMatchesStance("sell_vol", -0.2, true)).toBe("match");
    expect(structureMatchesStance("sell_vol", -0.2, false)).toBe("neutral");
    expect(structureMatchesStance("sell_vol", 0.2, true)).toBe("conflict");
  });

  it("matches long / event vol when vega is long", () => {
    expect(structureMatchesStance("buy_vol", 0.15, true)).toBe("match");
    expect(structureMatchesStance("event_vol", 0.15, true)).toBe("match");
    expect(structureMatchesStance("event_vol", -0.1, true)).toBe("conflict");
    expect(structureMatchesStance("wait", 0.2, true)).toBe("neutral");
  });
});

describe("customStructureView", () => {
  const lookup = (type: "call" | "put", strike: number) =>
    contract(type, strike);

  it("builds a debit from ask-to-buy on a long call", () => {
    const view = customStructureView(
      [{ type: "call", strike: 100, side: "long" }],
      lookup,
      "buy_vol"
    );
    expect(view).not.toBeNull();
    expect(view!.debitCredit).toBe("debit");
    expect(view!.netPremium).toBeCloseTo(2.2, 8);
    expect(view!.recommended).toBe(true);
    expect(view!.legs[0].premium).toBeCloseTo(2.2, 8);
  });

  it("vega-weights fill IV across mixed legs", () => {
    const iv = vegaWeightedIv(
      [
        {
          type: "call",
          side: "long",
          strike: 100,
          premium: 2,
          quantity: 1,
          iv: 0.2,
        },
        {
          type: "put",
          side: "long",
          strike: 100,
          premium: 2,
          quantity: 1,
          iv: 0.4,
        },
      ],
      (type, strike) =>
        contract(type, strike, { iv: type === "call" ? 0.2 : 0.4, vega: 0.1 })
    );
    expect(iv).toBeCloseTo(0.3, 8);
  });
});
