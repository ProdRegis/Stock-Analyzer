/**
 * Turning a screenshot of a brokerage account into holdings.
 *
 * OCR on financial tables misreads decimals and column boundaries often enough
 * that nothing here is trusted automatically. The model's output is validated
 * against strict shapes, anything suspicious is flagged, and the UI requires
 * the user to confirm every row before it reaches the portfolio.
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

export const IMPORT_PROMPT = `You are reading a screenshot of a stock brokerage account or portfolio tracker.

Extract every stock position you can see. For each one return:
- "symbol": the ticker symbol, uppercase. If only a company name is shown, return its ticker.
- "shares": the number of shares held, as a number. Fractional shares are allowed.
- "avgCost": the average cost or purchase price PER SHARE, as a number. Omit this field if the screenshot does not show a per-share cost.

Critical rules:
- "avgCost" is the price of ONE share. If you only see a total position value, omit avgCost rather than dividing.
- Do not confuse market value, daily change, or total gain with cost per share.
- Do not guess. Omit any position you cannot read clearly.
- Ignore cash balances, crypto, options, and account totals.

Respond with JSON only, in exactly this shape:
{"holdings":[{"symbol":"AAPL","shares":12,"avgCost":178.4}]}`;

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

export function parseImportResponse(raw: unknown): ImportResult {
  const warnings: string[] = [];

  if (typeof raw !== "object" || raw === null) {
    return { holdings: [], warnings: ["Could not read anything from that image."] };
  }

  const candidates = (raw as Record<string, unknown>).holdings;
  if (!Array.isArray(candidates)) {
    return { holdings: [], warnings: ["No positions found in that image."] };
  }

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
    warnings.push("No positions found in that image.");
  }

  return { holdings: merged, warnings };
}

/** Pulls the JSON object out of a model reply that may be fenced or prefixed. */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to locating an embedded object.
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}
