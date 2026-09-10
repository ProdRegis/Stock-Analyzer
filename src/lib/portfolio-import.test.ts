import { describe, expect, it } from "vitest";
import { buildImportResult } from "./portfolio-import";

describe("buildImportResult", () => {
  it("accepts well-formed rows", () => {
    const result = buildImportResult([
      { symbol: "AAPL", shares: 12, avgCost: 178.4 },
      { symbol: "MSFT", shares: 6 },
    ]);

    expect(result.warnings).toEqual([]);
    expect(result.holdings).toEqual([
      { symbol: "AAPL", shares: 12, avgCost: 178.4, warning: undefined },
      { symbol: "MSFT", shares: 6, avgCost: undefined, warning: undefined },
    ]);
  });

  it("parses numbers that arrived with currency formatting", () => {
    const result = buildImportResult([
      { symbol: "NVDA", shares: "1,250", avgCost: "$118.75" },
    ]);

    expect(result.holdings[0].shares).toBe(1250);
    expect(result.holdings[0].avgCost).toBe(118.75);
  });

  it("uppercases and accepts class-suffixed tickers", () => {
    expect(buildImportResult([{ symbol: "brk.b", shares: 2 }]).holdings[0].symbol).toBe(
      "BRK.B"
    );
  });

  it("drops rows with an unusable symbol or share count", () => {
    const result = buildImportResult([
      { symbol: "AAPL", shares: 5 },
      { symbol: "not a ticker", shares: 5 },
      { symbol: "TSLA", shares: 0 },
      { symbol: "MSFT", shares: -3 },
      { symbol: "GOOG" },
      null,
    ]);

    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].symbol).toBe("AAPL");
    expect(result.warnings[0]).toContain("5 rows could not be read");
  });

  it("uses singular wording for one skipped row", () => {
    const result = buildImportResult([
      { symbol: "AAPL", shares: 5 },
      { symbol: "???", shares: 1 },
    ]);

    expect(result.warnings[0]).toContain("1 row could not be read");
    expect(result.warnings[0]).toContain("was skipped");
  });

  it("ignores a zero or negative cost basis rather than storing it", () => {
    expect(
      buildImportResult([{ symbol: "AAPL", shares: 5, avgCost: 0 }]).holdings[0]
        .avgCost
    ).toBeUndefined();
  });

  it("flags a share count large enough to be a misread dollar value", () => {
    const result = buildImportResult([{ symbol: "AAPL", shares: 2_500_000 }]);

    expect(result.holdings[0].warning).toContain("Unusually large share count");
  });

  it("flags an implausible per-share price", () => {
    const result = buildImportResult([
      { symbol: "AAPL", shares: 5, avgCost: 4_000_000 },
    ]);

    expect(result.holdings[0].warning).toContain("Unusually high price");
  });

  it("merges duplicate tickers using a share-weighted average cost", () => {
    const result = buildImportResult([
      { symbol: "AAPL", shares: 10, avgCost: 100 },
      { symbol: "AAPL", shares: 30, avgCost: 200 },
    ]);

    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].shares).toBe(40);
    // Weighted, not the midpoint of 150.
    expect(result.holdings[0].avgCost).toBe(175);
    expect(result.holdings[0].warning).toContain("Merged");
  });

  it("drops the cost basis when only one of the merged rows had one", () => {
    // A basis covering part of the position would misstate P&L.
    const result = buildImportResult([
      { symbol: "AAPL", shares: 10, avgCost: 100 },
      { symbol: "AAPL", shares: 10 },
    ]);

    expect(result.holdings[0].shares).toBe(20);
    expect(result.holdings[0].avgCost).toBeUndefined();
  });

  it("reports an empty result with the caller's wording", () => {
    expect(buildImportResult([], "Nothing here.").warnings).toEqual([
      "Nothing here.",
    ]);
  });

  it("survives entries of the wrong type entirely", () => {
    const result = buildImportResult(["nonsense", 42, undefined, []]);

    expect(result.holdings).toEqual([]);
    expect(result.warnings[0]).toContain("could not be read");
  });
});
