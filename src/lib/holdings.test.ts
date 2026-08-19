import { describe, expect, it } from "vitest";
import {
  analyzableHoldings,
  analysisFingerprint,
  holdingsNeedReanalysis,
} from "./holdings";

describe("analyzableHoldings", () => {
  it("drops blank tickers and zero-share rows, and uppercases symbols", () => {
    expect(
      analyzableHoldings([
        { symbol: " aapl ", shares: 10, avgCost: 100 },
        { symbol: "MSFT", shares: 0 },
        { symbol: "", shares: 5 },
        { symbol: "nvda", shares: 2 },
      ])
    ).toEqual([
      { symbol: "AAPL", shares: 10, avgCost: 100 },
      { symbol: "NVDA", shares: 2 },
    ]);
  });
});

describe("holdingsNeedReanalysis", () => {
  const analyzed = [
    { symbol: "AAPL", shares: 12, avgCost: 178.4 },
    { symbol: "MSFT", shares: 6, avgCost: 405.2 },
  ];

  it("is false when nothing has been analyzed yet", () => {
    expect(holdingsNeedReanalysis(analyzed, null)).toBe(false);
  });

  it("is false when ticker, shares, and cost match", () => {
    expect(
      holdingsNeedReanalysis(
        [
          { symbol: "aapl", shares: 12, avgCost: 178.4, targetPrice: 210 },
          { symbol: "MSFT", shares: 6, avgCost: 405.2 },
        ],
        analyzed
      )
    ).toBe(false);
  });

  it("is true when shares or cost change", () => {
    expect(
      holdingsNeedReanalysis(
        [
          { symbol: "AAPL", shares: 20, avgCost: 178.4 },
          { symbol: "MSFT", shares: 6, avgCost: 405.2 },
        ],
        analyzed
      )
    ).toBe(true);

    expect(
      holdingsNeedReanalysis(
        [
          { symbol: "AAPL", shares: 12, avgCost: 190 },
          { symbol: "MSFT", shares: 6, avgCost: 405.2 },
        ],
        analyzed
      )
    ).toBe(true);
  });

  it("ignores empty editor rows and sell-reminder fields", () => {
    expect(
      holdingsNeedReanalysis(
        [
          { symbol: "AAPL", shares: 12, avgCost: 178.4, targetDate: "2026-12-01" },
          { symbol: "MSFT", shares: 6, avgCost: 405.2, targetPrice: 500 },
          { symbol: "", shares: 0 },
        ],
        analyzed
      )
    ).toBe(false);
  });
});

describe("analysisFingerprint", () => {
  it("treats order as part of identity", () => {
    const a = [
      { symbol: "AAPL", shares: 1 },
      { symbol: "MSFT", shares: 1 },
    ];
    const b = [
      { symbol: "MSFT", shares: 1 },
      { symbol: "AAPL", shares: 1 },
    ];
    expect(analysisFingerprint(a)).not.toBe(analysisFingerprint(b));
  });
});
