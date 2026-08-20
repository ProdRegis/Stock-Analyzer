import { describe, expect, it } from "vitest";
import { rankDipCandidates } from "./ranking";
import type { DipCandidate } from "./types";

function stub(over: Partial<DipCandidate>): DipCandidate {
  return {
    symbol: "X",
    name: "X",
    direction: "long",
    currentPrice: 10,
    changePercent: 0,
    dipPercent: 8,
    recoveryScore: 40,
    rsi: 32,
    nearestSupport: null,
    nearestResistance: null,
    distanceToSupport: 1,
    historicalRecoveryRate: 0.5,
    avgRecoveryDays: 5,
    pastDips: [],
    buyTiming: "now",
    buyTimingLabel: "now",
    predictedRecoveryDate: "",
    predictedRecoveryLabel: "",
    buyReason: "",
    predictionReason: "",
    sellTiming: "this_week",
    sellTimingLabel: "",
    predictedSellDate: "",
    predictedSellLabel: "",
    sellTargetPrice: 11,
    sellReason: "",
    sellPredictionReason: "",
    sellReasons: [],
    marketContext: { headlines: [], events: [] },
    stopLossPrice: 9,
    stopLossPercent: 10,
    stopLossLabel: "",
    stopLossReason: "",
    stopLossCalculation: "",
    stopLossReasons: [],
    stopLossWinningMethod: "",
    history: [],
    intradayHistory: [],
    supportLevels: [],
    resistanceLevels: [],
    marketState: "REGULAR",
    lastUpdated: "",
    ...over,
  };
}

describe("rankDipCandidates", () => {
  it("prefers a durable business over a speculative one at the same score", () => {
    const ranked = rankDipCandidates([
      stub({
        symbol: "SPEC",
        recoveryScore: 50,
        businessQuality: {
          grade: "Speculative",
          summary: "",
          flags: [],
          hardIndustry: false,
        },
      }),
      stub({
        symbol: "DUR",
        recoveryScore: 50,
        businessQuality: {
          grade: "Durable",
          summary: "",
          flags: [],
          hardIndustry: false,
        },
      }),
    ]);

    expect(ranked.map((item) => item.symbol)).toEqual(["DUR", "SPEC"]);
  });

  it("does not prefer a durable name when the setup is a short", () => {
    const ranked = rankDipCandidates([
      stub({
        symbol: "DUR",
        direction: "short",
        recoveryScore: 50,
        businessQuality: {
          grade: "Durable",
          summary: "",
          flags: [],
          hardIndustry: false,
        },
      }),
      stub({
        symbol: "SPEC",
        direction: "short",
        recoveryScore: 50,
        businessQuality: {
          grade: "Speculative",
          summary: "",
          flags: [],
          hardIndustry: false,
        },
      }),
    ]);

    expect(ranked.map((item) => item.symbol)).toEqual(["SPEC", "DUR"]);
  });
});
