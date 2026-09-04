import { scoreBusinessQuality } from "./business-quality";
import { TTL, cached } from "./cache";
import {
  forecastDividend,
  forecastEarnings,
  inferReportMove,
  type SurprisePoint,
} from "./event-forecast";
import { fetchFundamentals } from "./fundamentals";
import { fetchDailyHistory } from "./market-data";
import { computeATR } from "./technical";
import { yahooFinance } from "./yahoo-client";
import type { EventForecast, PricePoint, UpcomingMarketEvent } from "./types";

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

function unitRatio(value: unknown): number | null {
  const parsed = num(value);
  if (parsed == null) return null;
  return Math.abs(parsed) > 2 ? parsed / 100 : parsed;
}

function asDateIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

interface YahooHistoryRow {
  period?: string;
  quarter?: Date | string | null;
  epsActual?: number | null;
  epsEstimate?: number | null;
}

interface YahooTrendRow {
  period?: string;
  growth?: number | null;
  earningsEstimate?: {
    avg?: number | null;
    low?: number | null;
    high?: number | null;
    yearAgoEps?: number | null;
    numberOfAnalysts?: number | null;
  };
  revenueEstimate?: {
    avg?: number | null;
    low?: number | null;
    high?: number | null;
  };
  epsTrend?: {
    current?: number | null;
    "30daysAgo"?: number | null;
  };
}

async function fetchEventSummary(symbol: string): Promise<Record<string, unknown>> {
  const upper = symbol.toUpperCase();
  return cached(`summary:${upper}:event-research`, TTL.quoteSummary, () =>
    yahooFinance.quoteSummary(upper, {
      modules: [
        "calendarEvents",
        "earningsHistory",
        "earningsTrend",
        "summaryDetail",
        "defaultKeyStatistics",
      ],
    })
  ) as Promise<Record<string, unknown>>;
}

function inHorizon(time: number, now: number, horizon: number, allowYesterday: boolean): boolean {
  const floor = allowYesterday ? now - 24 * 60 * 60 * 1000 : now;
  return time >= floor && time <= horizon;
}

/**
 * Calendar rows for one symbol. Forecasts are filled in by the news feed
 * only for names that actually have a print or ex-date in the window.
 */
export async function listCalendarEvents(
  symbol: string,
  name: string,
  now = Date.now(),
  horizonMs = 30 * 24 * 60 * 60 * 1000
): Promise<UpcomingMarketEvent[]> {
  const upper = symbol.toUpperCase();
  const events: UpcomingMarketEvent[] = [];

  try {
    const summary = await cached(`summary:${upper}:calendar`, TTL.quoteSummary, () =>
      yahooFinance.quoteSummary(upper, { modules: ["calendarEvents"] })
    );
    const calendar = summary.calendarEvents as
      | {
          exDividendDate?: Date | string;
          earnings?: {
            earningsDate?: Array<Date | string>;
            earningsCallDate?: Array<Date | string>;
            earningsAverage?: number;
            earningsLow?: number;
            earningsHigh?: number;
            isEarningsDateEstimate?: boolean;
          };
        }
      | undefined;

    const earnings = calendar?.earnings;
    const estimate = {
      low: num(earnings?.earningsLow) ?? undefined,
      high: num(earnings?.earningsHigh) ?? undefined,
      avg: num(earnings?.earningsAverage) ?? undefined,
    };

    const printDates = (earnings?.earningsDate ?? [])
      .map((value) => asDateIso(value))
      .filter((value): value is string => Boolean(value))
      .filter((iso) =>
        inHorizon(new Date(iso).getTime(), now, now + horizonMs, true)
      );
    if (printDates[0]) {
      events.push({
        symbol: upper,
        name,
        type: "earnings",
        date: printDates[0],
        earningsEstimate:
          estimate.avg != null || estimate.low != null || estimate.high != null
            ? estimate
            : undefined,
      });
    }

    const callDates = (earnings?.earningsCallDate ?? [])
      .map((value) => asDateIso(value))
      .filter((value): value is string => Boolean(value))
      .filter((iso) =>
        inHorizon(new Date(iso).getTime(), now, now + horizonMs, true)
      );
    if (callDates[0]) {
      events.push({
        symbol: upper,
        name,
        type: "earnings_call",
        date: callDates[0],
      });
    }

    const ex = asDateIso(calendar?.exDividendDate);
    if (ex && inHorizon(new Date(ex).getTime(), now, now + horizonMs, false)) {
      events.push({
        symbol: upper,
        name,
        type: "dividend",
        date: ex,
      });
    }
  } catch {
    return [];
  }

  return events;
}

function pickCurrentQuarter(trend: YahooTrendRow[]): YahooTrendRow | null {
  return (
    trend.find((row) => row.period === "0q") ??
    trend.find((row) => row.period === "1q") ??
    trend[0] ??
    null
  );
}

function surprisePoints(history: YahooHistoryRow[]): SurprisePoint[] {
  const points: SurprisePoint[] = [];
  for (const row of history) {
    const actual = num(row.epsActual);
    const estimate = num(row.epsEstimate);
    if (actual == null || estimate == null) continue;
    points.push({
      period: row.period ?? "—",
      quarter: asDateIso(row.quarter)?.slice(0, 10) ?? null,
      epsActual: actual,
      epsEstimate: estimate,
    });
  }
  return points;
}

function printMovesFor(
  history: PricePoint[],
  surprises: SurprisePoint[]
): Array<{ surprisePercent: number; nextDayReturn: number }> {
  const moves: Array<{ surprisePercent: number; nextDayReturn: number }> = [];
  for (const row of surprises) {
    if (!row.quarter) continue;
    const inferred = inferReportMove(history, row.quarter);
    if (!inferred) continue;
    const surprise = (row.epsActual - row.epsEstimate) / Math.max(Math.abs(row.epsEstimate), 0.05);
    moves.push({
      surprisePercent: surprise,
      nextDayReturn: inferred.nextDayReturn,
    });
  }
  return moves;
}

export async function researchEventForecast(
  symbol: string,
  type: UpcomingMarketEvent["type"]
): Promise<EventForecast | null> {
  const upper = symbol.toUpperCase();

  try {
    const [summary, fundamentals, history] = await Promise.all([
      fetchEventSummary(upper),
      fetchFundamentals(upper).catch(() => null),
      fetchDailyHistory(upper).catch(() => [] as PricePoint[]),
    ]);

    const quality = fundamentals ? scoreBusinessQuality(fundamentals) : null;
    const last = history[history.length - 1];
    const atr =
      history.length > 20 && last && last.close > 0
        ? computeATR(history) / last.close
        : null;

    if (type === "dividend") {
      const detail = summary.summaryDetail as Record<string, unknown> | undefined;
      return forecastDividend({
        annualRate: num(detail?.dividendRate),
        trailingAnnual: num(detail?.trailingAnnualDividendRate),
        yield: unitRatio(detail?.dividendYield),
        fiveYearAvgYield: unitRatio(detail?.fiveYearAvgDividendYield),
        payoutRatio: unitRatio(detail?.payoutRatio),
        fcfPositive:
          fundamentals?.freeCashflow == null
            ? null
            : fundamentals.freeCashflow > 0,
        profitable:
          fundamentals == null
            ? null
            : (fundamentals.profitMargins ?? 0) > 0 &&
              (fundamentals.operatingMargins ?? 0) > 0,
        qualityGrade: quality?.grade ?? null,
        declared: true,
      });
    }

    const earningsHistory = summary.earningsHistory as
      | { history?: YahooHistoryRow[] }
      | undefined;
    const earningsTrend = summary.earningsTrend as
      | { trend?: YahooTrendRow[] }
      | undefined;
    const calendar = summary.calendarEvents as
      | {
          earnings?: {
            earningsAverage?: number;
            earningsLow?: number;
            earningsHigh?: number;
            revenueAverage?: number;
            revenueLow?: number;
            revenueHigh?: number;
          };
        }
      | undefined;

    const surprises = surprisePoints(earningsHistory?.history ?? []);
    const current = pickCurrentQuarter(earningsTrend?.trend ?? []);
    const cal = calendar?.earnings;

    const consensus =
      num(current?.earningsEstimate?.avg) ?? num(cal?.earningsAverage);
    const low = num(current?.earningsEstimate?.low) ?? num(cal?.earningsLow);
    const high = num(current?.earningsEstimate?.high) ?? num(cal?.earningsHigh);
    const currentEps = num(current?.epsTrend?.current);
    const eps30 = num(current?.epsTrend?.["30daysAgo"]);
    const revision30d =
      currentEps != null && eps30 != null ? currentEps - eps30 : null;

    return forecastEarnings({
      consensus,
      low,
      high,
      revenueAvg: num(current?.revenueEstimate?.avg) ?? num(cal?.revenueAverage),
      revenueLow: num(current?.revenueEstimate?.low) ?? num(cal?.revenueLow),
      revenueHigh: num(current?.revenueEstimate?.high) ?? num(cal?.revenueHigh),
      yearAgoEps: num(current?.earningsEstimate?.yearAgoEps),
      analystCount: num(current?.earningsEstimate?.numberOfAnalysts),
      revision30d,
      surprises,
      printMoves: printMovesFor(history, surprises),
      qualityGrade: quality?.grade ?? null,
      atrPercent: atr,
    });
  } catch {
    return null;
  }
}
