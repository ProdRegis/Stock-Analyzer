import { describe, expect, it } from "vitest";
import { DEMO_PORTFOLIO } from "./demo";

// Every first-time visitor lands on this data, so a malformed entry would
// break the default experience rather than one user's own portfolio.
describe("DEMO_PORTFOLIO", () => {
  it("has enough holdings for the correlation grid to render", () => {
    expect(DEMO_PORTFOLIO.length).toBeGreaterThanOrEqual(2);
  });

  it("uses uppercase, non-empty symbols", () => {
    for (const holding of DEMO_PORTFOLIO) {
      expect(holding.symbol).toMatch(/^[A-Z.-]{1,6}$/);
    }
  });

  it("has no duplicate symbols", () => {
    const symbols = DEMO_PORTFOLIO.map((holding) => holding.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("holds a positive number of shares in every position", () => {
    for (const holding of DEMO_PORTFOLIO) {
      expect(holding.shares).toBeGreaterThan(0);
    }
  });

  it("sets a cost basis everywhere so profit and loss is populated", () => {
    for (const holding of DEMO_PORTFOLIO) {
      expect(holding.avgCost).toBeDefined();
      expect(holding.avgCost).toBeGreaterThan(0);
    }
  });

  it("is diversified enough that no single name dominates the pie", () => {
    const costs = DEMO_PORTFOLIO.map(
      (holding) => holding.shares * (holding.avgCost ?? 0)
    );
    const total = costs.reduce((sum, value) => sum + value, 0);

    expect(Math.max(...costs) / total).toBeLessThan(0.5);
  });
});
