import { describe, expect, it } from "vitest";
import { normalizeIssuer, pickBestTicker } from "./cusip-ticker";

describe("normalizeIssuer", () => {
  it("strips legal suffixes so APPLE INC matches Apple", () => {
    expect(normalizeIssuer("APPLE INC")).toBe("APPLE");
    expect(normalizeIssuer("BERKSHIRE HATHAWAY INC DEL")).toContain(
      "BERKSHIRE HATHAWAY"
    );
  });
});

describe("pickBestTicker", () => {
  it("maps an issuer name onto a matching equity", () => {
    expect(
      pickBestTicker("APPLE INC", [
        {
          symbol: "AAPL",
          name: "Apple Inc.",
          exchange: "NMS",
          type: "Equity",
        },
        {
          symbol: "MSFT",
          name: "Microsoft Corporation",
          exchange: "NMS",
          type: "Equity",
        },
      ])
    ).toBe("AAPL");
  });

  it("refuses a match with no name overlap", () => {
    expect(
      pickBestTicker("UNKNOWN ISSUER LLC", [
        {
          symbol: "AAPL",
          name: "Apple Inc.",
          exchange: "NMS",
          type: "Equity",
        },
      ])
    ).toBeNull();
  });
});
