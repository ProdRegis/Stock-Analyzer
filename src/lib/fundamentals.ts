import { TTL, cached } from "./cache";
import { yahooFinance } from "./yahoo-client";

export interface CompanyFundamentals {
  symbol: string;
  name: string;
  currentPrice: number;
  currency: string;
  sector: string | null;
  industry: string | null;
  website: string | null;
  summary: string | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  totalRevenue: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  netIncome: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  grossMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  debtToEquity: number | null;
  trailingPe: number | null;
  forwardPe: number | null;
  forwardEps: number | null;
  trailingEps: number | null;
  sharesOutstanding: number | null;
  targetMeanPrice: number | null;
  recommendationKey: string | null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

/** Yahoo sometimes sends margins and ROE as 0.18, sometimes as 18. */
function unitRatio(value: unknown): number | null {
  const parsed = num(value);
  if (parsed == null) return null;
  return Math.abs(parsed) > 2 ? parsed / 100 : parsed;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * One Yahoo quoteSummary pull covering the filings snapshot a reverse DCF
 * and a create / capture / protect write-up both need.
 */
export async function fetchFundamentals(
  symbol: string
): Promise<CompanyFundamentals> {
  const upper = symbol.toUpperCase();

  const summary = await cached(
    `summary:${upper}:thesis`,
    TTL.quoteSummary,
    () =>
      yahooFinance.quoteSummary(upper, {
        modules: [
          "summaryProfile",
          "summaryDetail",
          "defaultKeyStatistics",
          "financialData",
          "price",
        ],
      })
  );

  const profile = summary.summaryProfile as Record<string, unknown> | undefined;
  const detail = summary.summaryDetail as Record<string, unknown> | undefined;
  const stats = summary.defaultKeyStatistics as
    | Record<string, unknown>
    | undefined;
  const financial = summary.financialData as Record<string, unknown> | undefined;
  const price = summary.price as Record<string, unknown> | undefined;

  const name =
    text(price?.longName) ??
    text(price?.shortName) ??
    text(price?.symbol) ??
    upper;

  return {
    symbol: upper,
    name,
    currentPrice: num(financial?.currentPrice) ?? num(price?.regularMarketPrice) ?? 0,
    currency: text(price?.currency) ?? "USD",
    sector: text(profile?.sector),
    industry: text(profile?.industry),
    website: text(profile?.website),
    summary: text(profile?.longBusinessSummary),
    marketCap: num(price?.marketCap) ?? num(detail?.marketCap),
    enterpriseValue: num(stats?.enterpriseValue),
    totalRevenue: num(financial?.totalRevenue),
    totalCash: num(financial?.totalCash),
    totalDebt: num(financial?.totalDebt),
    freeCashflow: num(financial?.freeCashflow),
    operatingCashflow: num(financial?.operatingCashflow),
    netIncome: num(stats?.netIncomeToCommon),
    revenueGrowth: unitRatio(financial?.revenueGrowth),
    earningsGrowth: unitRatio(financial?.earningsGrowth),
    grossMargins: unitRatio(financial?.grossMargins),
    operatingMargins: unitRatio(financial?.operatingMargins),
    profitMargins: unitRatio(financial?.profitMargins) ?? unitRatio(stats?.profitMargins),
    returnOnEquity: unitRatio(financial?.returnOnEquity),
    returnOnAssets: unitRatio(financial?.returnOnAssets),
    debtToEquity: num(financial?.debtToEquity),
    trailingPe: num(detail?.trailingPE) ?? num(stats?.trailingPE),
    forwardPe: num(detail?.forwardPE) ?? num(stats?.forwardPE),
    forwardEps: num(stats?.forwardEps),
    trailingEps: num(stats?.trailingEps),
    sharesOutstanding: num(stats?.sharesOutstanding),
    targetMeanPrice: num(financial?.targetMeanPrice),
    recommendationKey: text(financial?.recommendationKey),
  };
}
