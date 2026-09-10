/**
 * Rank optionable names the way a vol desk would: can you get a fill, then
 * is IV rich or cheap versus realized. Win-rate × max profit is not a screen.
 *
 * Thresholds follow tastytrade / CBOE-style liquidity practice and the
 * common screener floors (OI hundreds-to-thousands, spread well inside 10%):
 * ATM pair OI below 200 is thin; ATM spread above 12% of mid is a tax;
 * tight is a nickel-or-better book with four-figure open interest.
 */

import { scanEdge } from "./options-rank";
import type { OptionsLiquidity, OptionsScanRow } from "./types";

export function gradeLiquidity(
  spreadPct: number | null,
  openInterest: number | null
): OptionsLiquidity {
  if (openInterest == null || openInterest < 200) return "thin";
  if (spreadPct != null && spreadPct > 0.12) return "wide";
  if (
    openInterest >= 1000 &&
    (spreadPct == null || spreadPct <= 0.05)
  ) {
    return "tight";
  }
  if (spreadPct == null || spreadPct <= 0.12) return "workable";
  return "thin";
}

export function isTradeableLiquidity(liquidity: OptionsLiquidity): boolean {
  return liquidity === "tight" || liquidity === "workable";
}

/** Higher is a cleaner first name: liquid, then |ln(IV/RV)|. */
export function universeScore(row: OptionsScanRow): number {
  if (row.skipped) return -10;
  if (row.liquidity === "thin") return -5;
  if (row.liquidity === "wide") return -3;

  let score = scanEdge(row);
  if (row.liquidity === "tight") score += 0.15;
  else score += 0.05;
  if (row.earningsInWindow && row.stance !== "event_vol") score -= 0.2;
  return score;
}

export function sortUniverseRows(rows: OptionsScanRow[]): OptionsScanRow[] {
  return [...rows].sort((a, b) => {
    const score = universeScore(b) - universeScore(a);
    if (Math.abs(score) > 1e-9) return score;
    const spread = (a.atmSpreadPct ?? 1) - (b.atmSpreadPct ?? 1);
    if (Math.abs(spread) > 1e-9) return spread;
    return a.symbol.localeCompare(b.symbol);
  });
}

/** One name to open first: liquid and an everyday vol view, not an earnings print. */
export function pickStarter(rows: OptionsScanRow[]): OptionsScanRow | null {
  return (
    sortUniverseRows(rows).find(
      (row) =>
        !row.skipped &&
        isTradeableLiquidity(row.liquidity) &&
        (row.stance === "buy_vol" || row.stance === "sell_vol")
    ) ?? null
  );
}
