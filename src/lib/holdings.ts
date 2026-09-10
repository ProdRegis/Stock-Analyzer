import type { PortfolioHolding } from "./types";

/** Rows the analyzer will actually use: a ticker and a positive share count. */
export function analyzableHoldings(
  holdings: PortfolioHolding[]
): PortfolioHolding[] {
  return holdings
    .map((row) => ({
      ...row,
      symbol: row.symbol.trim().toUpperCase(),
    }))
    .filter((row) => row.symbol.length > 0 && row.shares > 0);
}

/**
 * Identity of a portfolio for “do we need to run Analyze again?”
 *
 * Sell reminders are client-side and do not change the numbers, so they are
 * left out. Empty and zero-share rows are ignored the same way the submit
 * path ignores them.
 */
export function analysisFingerprint(holdings: PortfolioHolding[]): string {
  return analyzableHoldings(holdings)
    .map((row) => `${row.symbol}:${row.shares}:${row.avgCost ?? ""}`)
    .join("|");
}

export function holdingsNeedReanalysis(
  current: PortfolioHolding[],
  analyzed: PortfolioHolding[] | null
): boolean {
  if (analyzed == null) return false;
  return analysisFingerprint(current) !== analysisFingerprint(analyzed);
}
