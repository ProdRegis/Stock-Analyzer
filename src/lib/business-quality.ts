import { fetchFundamentals, type CompanyFundamentals } from "./fundamentals";
import type { BusinessQuality, BusinessQualityGrade } from "./types";

export type { BusinessQuality, BusinessQualityGrade };

const HARD_INDUSTRY =
  /biotech|pharmaceutical|semiconductor|drug manufacturer|diagnostics|gene|oncology/i;

export function isHardIndustry(
  sector: string | null,
  industry: string | null
): boolean {
  return HARD_INDUSTRY.test(`${sector ?? ""} ${industry ?? ""}`);
}

function pct(value: number | null): string {
  if (value == null) return "n/a";
  return `${(value * 100).toFixed(0)}%`;
}

/**
 * Grade the business, not the chart. A dip in a durable earner is a setup;
 * a dip in an unprofitable, highly leveraged name is a falling knife.
 *
 * Pass is the video's "kick it out" bucket: you can still look at the 10-K,
 * but this app will not treat it as a recommendation.
 */
export function scoreBusinessQuality(
  fundamentals: CompanyFundamentals
): BusinessQuality {
  const flags: string[] = [];
  const hardIndustry = isHardIndustry(
    fundamentals.sector,
    fundamentals.industry
  );

  const profitable =
    (fundamentals.profitMargins ?? -1) > 0 &&
    (fundamentals.operatingMargins ?? -1) > 0;
  const fcfPositive =
    fundamentals.freeCashflow != null && fundamentals.freeCashflow > 0;
  const highDebt =
    fundamentals.debtToEquity != null && fundamentals.debtToEquity > 150;
  const veryHighDebt =
    fundamentals.debtToEquity != null && fundamentals.debtToEquity > 250;
  const noRevenue =
    fundamentals.totalRevenue == null || fundamentals.totalRevenue <= 0;
  const fatMargins =
    (fundamentals.operatingMargins ?? 0) >= 0.12 &&
    (fundamentals.profitMargins ?? 0) >= 0.08;
  const decentRoe =
    fundamentals.returnOnEquity == null || fundamentals.returnOnEquity >= 0.12;

  if (hardIndustry) {
    flags.push(
      `${fundamentals.industry ?? fundamentals.sector ?? "This industry"} is easy to misunderstand. Stay here only if you already know the product.`
    );
  }
  if (!profitable) {
    flags.push("Not currently profitable — a harder analysis than a cash-earning business.");
  }
  if (veryHighDebt) {
    flags.push(
      `Debt/equity is ${(fundamentals.debtToEquity ?? 0).toFixed(0)}. Leverage can erase equity in a downturn.`
    );
  } else if (highDebt) {
    flags.push(`Elevated leverage (debt/equity ${(fundamentals.debtToEquity ?? 0).toFixed(0)}).`);
  }
  if (noRevenue) {
    flags.push("No revenue on the snapshot we have.");
  }
  if (fcfPositive) {
    flags.push("Produces free cash flow.");
  } else if (fundamentals.freeCashflow != null && fundamentals.freeCashflow < 0) {
    flags.push("Free cash flow is negative — the business is consuming cash.");
  }
  if (fatMargins && profitable) {
    flags.push(
      `Keeps a real slice of each dollar (operating margin ${pct(fundamentals.operatingMargins)}).`
    );
  }

  let grade: BusinessQualityGrade = "Fair";

  if (
    (noRevenue && !profitable) ||
    (hardIndustry && !profitable) ||
    (veryHighDebt && !profitable)
  ) {
    grade = "Pass";
  } else if (!profitable) {
    grade = "Speculative";
  } else if (fatMargins && decentRoe && !veryHighDebt && fcfPositive) {
    grade = "Durable";
  } else if (fatMargins && decentRoe && !veryHighDebt) {
    grade = "Durable";
  } else if (profitable) {
    grade = "Fair";
  }

  const summary =
    grade === "Pass"
      ? "Kick this out of the buy pile until the path to cash is obvious."
      : grade === "Speculative"
        ? "A trade or a study project, not a plain-vanilla compounder."
        : grade === "Durable"
          ? "Looks like a business that creates, captures, and keeps value."
          : "Profitable, but the moat and balance sheet are not slam dunks.";

  return { grade, summary, flags, hardIndustry };
}

/** Additive rank nudge so scanners prefer durable businesses, all else equal. */
export function qualityRankBoost(
  grade: BusinessQualityGrade | undefined,
  direction: "long" | "short" = "long"
): number {
  const boost =
    grade === "Durable"
      ? 12
      : grade === "Speculative"
        ? -8
        : grade === "Pass"
          ? -16
          : 0;

  // Shorting a durable earner is fading a real business. Prefer the opposite.
  return direction === "short" ? -boost * 0.6 : boost;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    const current = index++;
    if (current >= items.length) return;
    results[current] = await worker(items[current]);
    await runNext();
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runNext())
  );
  return results;
}

/**
 * Attach a business-quality grade to scanner hits. Only the names that already
 * cleared the technical screen are fetched, so a full universe scan does not
 * grow by 86 quoteSummary calls.
 */
export async function attachBusinessQuality<T extends { symbol: string }>(
  items: T[]
): Promise<T[]> {
  if (items.length === 0) return items;

  const unique = [...new Set(items.map((item) => item.symbol.toUpperCase()))];
  const bySymbol = new Map<string, BusinessQuality>();

  await runWithConcurrency(unique, 4, async (symbol) => {
    try {
      const fundamentals = await fetchFundamentals(symbol);
      bySymbol.set(symbol, scoreBusinessQuality(fundamentals));
    } catch {
      // Leave ungraded; ranking treats missing quality as a zero boost.
    }
  });

  return items.map((item) => {
    const quality = bySymbol.get(item.symbol.toUpperCase());
    return quality ? { ...item, businessQuality: quality } : item;
  });
}
