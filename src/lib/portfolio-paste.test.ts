import { describe, expect, it } from "vitest";
import { parsePastedHoldings } from "./portfolio-paste";

describe("parsePastedHoldings", () => {
  it("reads the JSON an AI chat returns", () => {
    const reply = '{"holdings":[{"symbol":"AAPL","shares":12,"avgCost":178.40}]}';

    expect(parsePastedHoldings(reply).holdings).toEqual([
      { symbol: "AAPL", shares: 12, avgCost: 178.4, warning: undefined },
    ]);
  });

  it("tolerates the markdown fence a chat reply often arrives in", () => {
    const fenced = '```json\n{"holdings":[{"symbol":"MSFT","shares":6}]}\n```';

    expect(parsePastedHoldings(fenced).holdings[0].symbol).toBe("MSFT");
  });

  it("accepts a bare JSON array", () => {
    const bare = '[{"symbol":"NVDA","shares":15}]';

    expect(parsePastedHoldings(bare).holdings[0].symbol).toBe("NVDA");
  });

  it("reads comma-separated rows", () => {
    const csv = "AAPL,12,178.40\nMSFT,6,405.20";
    const result = parsePastedHoldings(csv);

    expect(result.holdings).toEqual([
      { symbol: "AAPL", shares: 12, avgCost: 178.4, warning: undefined },
      { symbol: "MSFT", shares: 6, avgCost: 405.2, warning: undefined },
    ]);
  });

  it("reads tab-separated rows copied from a spreadsheet", () => {
    const tsv = "AAPL\t12\t178.40\nMSFT\t6\t405.20";

    expect(parsePastedHoldings(tsv).holdings).toHaveLength(2);
  });

  it("reads space-separated rows", () => {
    const text = "AAPL 12 178.40";

    expect(parsePastedHoldings(text).holdings[0]).toMatchObject({
      symbol: "AAPL",
      shares: 12,
      avgCost: 178.4,
    });
  });

  it("skips a header row", () => {
    const csv = "Symbol,Shares,Avg Cost\nAAPL,12,178.40";
    const result = parsePastedHoldings(csv);

    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].symbol).toBe("AAPL");
  });

  it("strips currency symbols and digit grouping from spaced text", () => {
    const result = parsePastedHoldings("BRK.A 2 $612,345.67");

    expect(result.holdings[0].symbol).toBe("BRK.A");
    expect(result.holdings[0].shares).toBe(2);
    expect(result.holdings[0].avgCost).toBeCloseTo(612345.67, 2);
  });

  it("keeps grouped digits that a CSV export wrapped in quotes", () => {
    // Unquoted, the comma in 612,345.67 is indistinguishable from a column
    // break, which is exactly why exports quote it.
    const result = parsePastedHoldings('BRK.A,2,"612,345.67"');

    expect(result.holdings[0].shares).toBe(2);
    expect(result.holdings[0].avgCost).toBeCloseTo(612345.67, 2);
  });

  it("prefers a parenthesised ticker over capitalised company words", () => {
    const text = "Apple Inc (AAPL) 12 178.40";

    expect(parsePastedHoldings(text).holdings[0].symbol).toBe("AAPL");
  });

  it("ignores columns beyond cost, which the app recomputes", () => {
    // symbol, shares, avg cost, market value, day change
    const text = "AAPL,12,178.40,2680.00,+1.25";
    const result = parsePastedHoldings(text);

    expect(result.holdings[0].shares).toBe(12);
    expect(result.holdings[0].avgCost).toBe(178.4);
  });

  it("treats a missing cost as absent rather than zero", () => {
    const result = parsePastedHoldings("AAPL,12");

    expect(result.holdings[0].shares).toBe(12);
    expect(result.holdings[0].avgCost).toBeUndefined();
  });

  it("merges duplicate tickers with a share-weighted cost", () => {
    const result = parsePastedHoldings("AAPL,10,100\nAAPL,30,200");

    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].shares).toBe(40);
    expect(result.holdings[0].avgCost).toBe(175);
  });

  it("skips blank lines and prose without failing the whole paste", () => {
    const messy = [
      "Here are your holdings:",
      "",
      "AAPL,12,178.40",
      "   ",
      "Total: $12,345",
      "MSFT,6,405.20",
    ].join("\n");

    const result = parsePastedHoldings(messy);
    expect(result.holdings.map((row) => row.symbol)).toEqual(["AAPL", "MSFT"]);
  });

  it("still flags implausible values, as the image path does", () => {
    const result = parsePastedHoldings("AAPL,2500000");

    expect(result.holdings[0].warning).toContain("Unusually large share count");
  });

  it("asks for input when given nothing", () => {
    expect(parsePastedHoldings("").warnings[0]).toContain("Paste your holdings");
    expect(parsePastedHoldings("   \n  ").warnings[0]).toContain(
      "Paste your holdings"
    );
  });

  it("explains itself when the text has no positions in it", () => {
    const result = parsePastedHoldings("just some words\nand more words");

    expect(result.holdings).toEqual([]);
    expect(result.warnings[0]).toContain("Nothing recognisable");
  });

  it("falls back to line parsing when the JSON is malformed", () => {
    const broken = '{"holdings":[{"symbol":"AAPL"\nAAPL,12,178.40';

    expect(parsePastedHoldings(broken).holdings[0].symbol).toBe("AAPL");
  });
});
