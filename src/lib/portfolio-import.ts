/**
 * Validation shared by every route into the portfolio.
 *
 * Imported rows arrive from text that was typed, copied out of a brokerage
 * table, or transcribed from a screenshot by a chat assistant. None of those
 * are trustworthy enough to apply directly: a misread share count or cost
 * basis would silently distort every risk and P&L figure downstream. So rows
 * are checked against strict shapes, anything implausible is flagged, and the
 * UI requires confirmation before any of it reaches the portfolio.
 */

import type { PortfolioHolding } from "./types";

export interface ImportedHolding extends PortfolioHolding {
  /** Set when a value looks implausible and deserves a second look. */
  warning?: string;
}

export interface ImportResult {
  holdings: ImportedHolding[];
  /** Problems affecting the import as a whole, shown above the review table. */
  warnings: string[];
}

/** Tickers are 1–6 letters, optionally with a class suffix like BRK.B. */
const SYMBOL_PATTERN = /^[A-Z]{1,6}(?:[.-][A-Z]{1,2})?$/;

/** Above this, a "share count" is more likely a misread dollar amount. */
const IMPLAUSIBLE_SHARES = 1_000_000;
const IMPLAUSIBLE_PRICE = 1_000_000;

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    // Models sometimes echo the screenshot's formatting: "$1,234.56".
    const cleaned = value.replace(/[$,\s]/g, "");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const symbol = value.trim().toUpperCase();
  return SYMBOL_PATTERN.test(symbol) ? symbol : null;
}

/**
 * Combines duplicate tickers into one position. Averaging must be weighted by
 * share count, since two lots of different sizes do not contribute equally to
 * the blended cost basis.
 */
function mergeDuplicates(holdings: ImportedHolding[]): ImportedHolding[] {
  const bySymbol = new Map<string, ImportedHolding>();

  for (const holding of holdings) {
    const existing = bySymbol.get(holding.symbol);

    if (!existing) {
      bySymbol.set(holding.symbol, { ...holding });
      continue;
    }

    const totalShares = existing.shares + holding.shares;
    let avgCost: number | undefined;

    if (existing.avgCost != null && holding.avgCost != null) {
      avgCost =
        (existing.avgCost * existing.shares + holding.avgCost * holding.shares) /
        totalShares;
    } else {
      // A partial cost basis would misstate P&L, so drop it entirely and let
      // the user retype it rather than report a number covering some shares.
      avgCost = undefined;
    }

    bySymbol.set(holding.symbol, {
      symbol: holding.symbol,
      shares: totalShares,
      avgCost,
      warning: "Merged from multiple rows — verify the totals.",
    });
  }

  return [...bySymbol.values()];
}

/**
 * Validates raw rows into holdings, flagging the implausible and merging
 * duplicates. Shared by both import paths so a screenshot and a pasted table
 * get identical scrutiny.
 */
export function buildImportResult(
  candidates: unknown[],
  emptyMessage = "No positions found."
): ImportResult {
  const warnings: string[] = [];
  const holdings: ImportedHolding[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null) {
      skipped++;
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const symbol = normalizeSymbol(record.symbol);
    const shares = coerceNumber(record.shares);

    if (symbol === null || shares === null || shares <= 0) {
      skipped++;
      continue;
    }

    const rawCost = coerceNumber(record.avgCost);
    const avgCost = rawCost !== null && rawCost > 0 ? rawCost : undefined;

    let warning: string | undefined;
    if (shares > IMPLAUSIBLE_SHARES) {
      warning = "Unusually large share count — check this was not a dollar value.";
    } else if (avgCost != null && avgCost > IMPLAUSIBLE_PRICE) {
      warning = "Unusually high price per share — check this was not a total.";
    }

    holdings.push({ symbol, shares, avgCost, warning });
  }

  if (skipped > 0) {
    warnings.push(
      `${skipped} row${skipped === 1 ? "" : "s"} could not be read and ${skipped === 1 ? "was" : "were"} skipped.`
    );
  }

  const merged = mergeDuplicates(holdings);

  if (merged.length === 0 && warnings.length === 0) {
    warnings.push(emptyMessage);
  }

  return { holdings: merged, warnings };
}

