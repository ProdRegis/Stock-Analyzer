/**
 * Assemble a professional options desk snapshot from Yahoo chains and history.
 *
 * The chain is the tape. IV is the price of vol. RV is the benchmark. The
 * stance is whether that price looks rich or cheap — not whether the stock
 * "should" go up.
 */

import {
  blackScholesGreeks,
  impliedVolatility,
  intrinsicValue,
  midPrice,
  timeYearsFromDays,
} from "./black-scholes";
import { TTL, cached } from "./cache";
import { fetchDailyHistory, fetchQuote } from "./market-data";
import { fetchRiskFreeRate } from "./market-rates";
import {
  EQUITY_MULTIPLIER,
  callDebitSpread,
  expirationStats,
  ironCondor,
  longCall,
  longPut,
  longStraddle,
  longStrangle,
  putCreditSpread,
  shortCall,
  shortPut,
  type StructureLeg,
} from "./options-structures";
import {
  classifyTermStructure,
  forwardVolatility,
  ivRvRatio,
  nearestBy,
  termSlopePerMonth,
  volStance,
  type TermPoint,
} from "./options-surface";
import {
  expectedMove,
  percentileRank,
  realizedVolWindows,
  rollingCloseToClose,
  ruleOf16DailyMove,
} from "./realized-vol";
import type {
  OptionChainRow,
  OptionContract,
  OptionExpirationMeta,
  OptionRight,
  OptionStructureId,
  OptionStructureView,
  OptionsDeskSnapshot,
} from "./types";
import { yahooFinance } from "./yahoo-client";

interface RawContract {
  contractSymbol?: string;
  strike?: number;
  lastPrice?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  inTheMoney?: boolean;
}

interface RawExpiry {
  expirationDate?: Date;
  calls?: RawContract[];
  puts?: RawContract[];
}

interface RawChain {
  expirationDates?: Date[];
  quote?: Record<string, unknown>;
  options?: RawExpiry[];
}

function asNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

function asUnit(value: unknown): number {
  const parsed = asNum(value);
  if (parsed == null || parsed < 0) return 0;
  return parsed > 1.5 ? parsed / 100 : parsed;
}

export function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return null;
}

export function calendarDte(expiration: string, now = new Date()): number {
  const exp = Date.parse(`${expiration}T00:00:00.000Z`);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  if (!Number.isFinite(exp)) return 0;
  return Math.max(0, Math.round((exp - today) / 86_400_000));
}

export function normalizeYahooIv(value: unknown): number | null {
  const parsed = asNum(value);
  if (parsed == null || parsed <= 0) return null;
  return parsed > 3 ? parsed / 100 : parsed;
}

export function pickExpirationDates(dates: Date[], now = new Date()): Date[] {
  const future = dates
    .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()))
    .filter((date) => date.getTime() >= now.getTime() - 86_400_000)
    .sort((a, b) => a.getTime() - b.getTime());

  if (future.length === 0) {
    return dates.slice(0, 1);
  }

  const picked: Date[] = [future[0]];
  for (const target of [7, 21, 30, 45, 60, 90, 180]) {
    let best: Date | null = null;
    let bestDist = Infinity;
    for (const date of future) {
      const iso = date.toISOString().slice(0, 10);
      const dte = calendarDte(iso, now);
      const dist = Math.abs(dte - target);
      if (
        dist < bestDist &&
        !picked.some((row) => row.getTime() === date.getTime())
      ) {
        best = date;
        bestDist = dist;
      }
    }
    if (best && bestDist <= 24) picked.push(best);
  }

  const unique = [
    ...new Map(
      picked.map((date) => [date.toISOString().slice(0, 10), date])
    ).values(),
  ];
  return unique.slice(0, 7);
}

export function windowStrikes(
  strikes: number[],
  spot: number,
  max = 37
): number[] {
  const sorted = [...new Set(strikes.filter((strike) => strike > 0))].sort(
    (a, b) => a - b
  );
  if (sorted.length <= max) return sorted;
  let atmIndex = 0;
  let best = Infinity;
  for (let i = 0; i < sorted.length; i++) {
    const dist = Math.abs(sorted[i] - spot);
    if (dist < best) {
      best = dist;
      atmIndex = i;
    }
  }
  const half = Math.floor(max / 2);
  const start = Math.max(0, Math.min(atmIndex - half, sorted.length - max));
  return sorted.slice(start, start + max);
}

async function fetchRawChain(symbol: string, date?: Date): Promise<RawChain> {
  const iso = date ? date.toISOString().slice(0, 10) : "index";
  return cached(`options:${symbol}:${iso}`, TTL.options, async () => {
    const result = date
      ? await yahooFinance.options(symbol, { date })
      : await yahooFinance.options(symbol);
    return result as RawChain;
  });
}

function enrichContract(
  raw: RawContract,
  type: OptionRight,
  spot: number,
  timeYears: number,
  rate: number,
  dividendYield: number
): OptionContract | null {
  const strike = asNum(raw.strike);
  if (strike == null || strike <= 0) return null;

  const bid = asNum(raw.bid);
  const ask = asNum(raw.ask);
  const last = asNum(raw.lastPrice);
  const mid = midPrice(bid, ask, last);
  const spread =
    bid != null && ask != null && ask >= bid ? ask - bid : null;
  const spreadPct =
    spread != null && mid != null && mid > 0 ? spread / mid : null;
  const yahooIv = normalizeYahooIv(raw.impliedVolatility);
  let iv = yahooIv;
  let ivSource: OptionContract["ivSource"] = yahooIv != null ? "yahoo" : null;
  if (iv == null && mid != null && mid > 0) {
    iv = impliedVolatility({
      type,
      spot,
      strike,
      timeYears,
      rate,
      dividendYield,
      price: mid,
    });
    ivSource = iv != null ? "inverted" : null;
  }

  const greeks =
    iv != null
      ? blackScholesGreeks({
          type,
          spot,
          strike,
          timeYears,
          rate,
          dividendYield,
          volatility: iv,
        })
      : null;

  const intrinsic = intrinsicValue(type, spot, strike);
  const extrinsic = mid != null ? mid - intrinsic : null;
  const openInterest = asNum(raw.openInterest);
  const illiquid =
    mid == null ||
    (spreadPct != null && spreadPct > 0.15) ||
    (openInterest != null && openInterest < 50);

  return {
    contractSymbol: raw.contractSymbol ?? `${type}-${strike}`,
    type,
    strike,
    bid,
    ask,
    last,
    mid,
    spread,
    spreadPct,
    volume: asNum(raw.volume),
    openInterest,
    yahooIv,
    iv,
    ivSource,
    delta: greeks?.delta ?? null,
    gamma: greeks?.gamma ?? null,
    theta: greeks?.theta ?? null,
    vega: greeks?.vega ?? null,
    rho: greeks?.rho ?? null,
    intrinsic,
    extrinsic,
    inTheMoney: raw.inTheMoney ?? intrinsic > 0,
    illiquid,
  };
}

function rowsFromExpiry(
  expiry: RawExpiry,
  spot: number,
  timeYears: number,
  rate: number,
  dividendYield: number
): OptionChainRow[] {
  const calls = (expiry.calls ?? [])
    .map((raw) =>
      enrichContract(raw, "call", spot, timeYears, rate, dividendYield)
    )
    .filter((row): row is OptionContract => row != null);
  const puts = (expiry.puts ?? [])
    .map((raw) =>
      enrichContract(raw, "put", spot, timeYears, rate, dividendYield)
    )
    .filter((row): row is OptionContract => row != null);

  const callByStrike = new Map(calls.map((row) => [row.strike, row]));
  const putByStrike = new Map(puts.map((row) => [row.strike, row]));
  const strikes = windowStrikes(
    [...callByStrike.keys(), ...putByStrike.keys()],
    spot
  );

  return strikes.map((strike) => ({
    strike,
    call: callByStrike.get(strike) ?? null,
    put: putByStrike.get(strike) ?? null,
  }));
}

function atmFromRows(
  rows: OptionChainRow[],
  spot: number
): {
  strike: number;
  iv: number | null;
  call: OptionContract | null;
  put: OptionContract | null;
} | null {
  if (rows.length === 0) return null;
  const row = nearestBy(rows, spot, (item) => item.strike);
  if (!row) return null;
  const iv =
    row.call?.iv != null && row.put?.iv != null
      ? (row.call.iv + row.put.iv) / 2
      : (row.call?.iv ?? row.put?.iv ?? null);
  return { strike: row.strike, iv, call: row.call, put: row.put };
}

function premiumFor(
  contract: OptionContract | null,
  side: "long" | "short"
): number | null {
  if (!contract) return null;
  if (side === "long" && contract.ask != null && contract.ask > 0) {
    return contract.ask;
  }
  if (side === "short" && contract.bid != null && contract.bid > 0) {
    return contract.bid;
  }
  return contract.mid != null && contract.mid > 0 ? contract.mid : null;
}

function netGreeks(legs: StructureLeg[], lookup: Map<string, OptionContract>) {
  let delta = 0;
  let gamma = 0;
  let theta = 0;
  let vega = 0;
  let missing = false;
  for (const leg of legs) {
    const contract = lookup.get(`${leg.type}:${leg.strike}`);
    const sign = (leg.side === "long" ? 1 : -1) * leg.quantity;
    if (!contract || contract.delta == null) {
      missing = true;
      continue;
    }
    delta += sign * contract.delta;
    gamma += sign * (contract.gamma ?? 0);
    theta += sign * (contract.theta ?? 0);
    vega += sign * (contract.vega ?? 0);
  }
  if (missing && delta === 0 && gamma === 0) {
    return { delta: null, gamma: null, theta: null, vega: null };
  }
  return { delta, gamma, theta, vega };
}

function structureView(
  id: OptionStructureId,
  name: string,
  thesis: string,
  legs: StructureLeg[],
  lookup: Map<string, OptionContract>,
  recommended: boolean
): OptionStructureView | null {
  if (legs.some((leg) => !(leg.premium > 0))) return null;
  const stats = expirationStats(legs);
  const greeks = netGreeks(legs, lookup);
  return {
    id,
    name,
    thesis,
    debitCredit: stats.debitCredit,
    netPremium: stats.netPremium,
    multiplier: EQUITY_MULTIPLIER,
    maxProfit: stats.maxProfit,
    maxLoss: stats.maxLoss,
    breakevens: stats.breakevens,
    capitalAtRisk: stats.capitalAtRisk,
    definedRisk: stats.definedRisk,
    recommended,
    legs: legs.map((leg) => {
      const contract = lookup.get(`${leg.type}:${leg.strike}`);
      return {
        type: leg.type,
        side: leg.side,
        strike: leg.strike,
        premium: leg.premium,
        delta: contract?.delta ?? null,
        iv: contract?.iv ?? null,
      };
    }),
    payoff: stats.payoff,
    netDelta: greeks.delta,
    netGamma: greeks.gamma,
    netTheta: greeks.theta,
    netVega: greeks.vega,
  };
}

export function buildStructuresFromChain(
  rows: OptionChainRow[],
  preferred: OptionsDeskSnapshot["preferredStructure"]
): OptionStructureView[] {
  const calls = rows
    .map((row) => row.call)
    .filter((row): row is OptionContract => row != null);
  const puts = rows
    .map((row) => row.put)
    .filter((row): row is OptionContract => row != null);
  const lookup = new Map<string, OptionContract>();
  for (const contract of [...calls, ...puts]) {
    lookup.set(`${contract.type}:${contract.strike}`, contract);
  }

  const atmCall = nearestBy(calls, 0.5, (row) => row.delta);
  const atmPut = nearestBy(puts, -0.5, (row) => row.delta);
  const shortPutLeg = nearestBy(puts, -0.3, (row) => row.delta);
  const longPutWing = nearestBy(puts, -0.12, (row) => row.delta);
  const shortCallLeg = nearestBy(calls, 0.3, (row) => row.delta);
  const longCallWing = nearestBy(calls, 0.12, (row) => row.delta);
  const otmPut = nearestBy(puts, -0.25, (row) => row.delta);
  const otmCall = nearestBy(calls, 0.25, (row) => row.delta);

  const views: Array<OptionStructureView | null> = [];

  if (atmCall) {
    const premium = premiumFor(atmCall, "long");
    if (premium != null) {
      views.push(
        structureView(
          "long_call",
          "Long ATM call",
          "Bullish direction plus a view that this call's IV is cheap versus the move you expect. Max loss is the debit. Unlimited upside.",
          longCall(atmCall.strike, premium),
          lookup,
          false
        )
      );
    }
  }

  if (atmPut) {
    const premium = premiumFor(atmPut, "long");
    if (premium != null) {
      views.push(
        structureView(
          "long_put",
          "Long ATM put",
          "Bearish direction or a hedge on long stock. You pay theta for the floor. Max loss is the debit.",
          longPut(atmPut.strike, premium),
          lookup,
          false
        )
      );
    }
  }

  if (atmCall && atmPut && atmCall.strike === atmPut.strike) {
    const callP = premiumFor(atmCall, "long");
    const putP = premiumFor(atmPut, "long");
    if (callP != null && putP != null) {
      views.push(
        structureView(
          "long_straddle",
          "Long ATM straddle",
          "Pure long volatility: you need a large move or an IV expansion to beat the double theta. Direction is not the bet.",
          longStraddle(atmCall.strike, callP, putP),
          lookup,
          preferred === "long_straddle"
        )
      );
    }
  }

  if (otmPut && otmCall && otmPut.strike < otmCall.strike) {
    const putP = premiumFor(otmPut, "long");
    const callP = premiumFor(otmCall, "long");
    if (putP != null && callP != null) {
      views.push(
        structureView(
          "long_strangle",
          "Long 25-delta strangle",
          "Cheaper long-vol than a straddle. Needs an even larger move to pay. Same thesis, wider breakevens.",
          longStrangle(otmPut.strike, putP, otmCall.strike, callP),
          lookup,
          preferred === "long_strangle"
        )
      );
    }
  }

  if (atmCall && shortCallLeg && atmCall.strike < shortCallLeg.strike) {
    const longP = premiumFor(atmCall, "long");
    const shortP = premiumFor(shortCallLeg, "short");
    if (longP != null && shortP != null) {
      views.push(
        structureView(
          "call_debit_spread",
          "Call debit spread",
          "Moderately bullish, defined risk. You buy ATM and sell further OTM to cut the debit — and cap the win. Skew is part of the price.",
          callDebitSpread(atmCall.strike, longP, shortCallLeg.strike, shortP),
          lookup,
          preferred === "call_debit_spread"
        )
      );
    }
  }

  if (shortPutLeg && longPutWing && longPutWing.strike < shortPutLeg.strike) {
    const shortP = premiumFor(shortPutLeg, "short");
    const longP = premiumFor(longPutWing, "long");
    if (shortP != null && longP != null) {
      views.push(
        structureView(
          "put_credit_spread",
          "Put credit spread",
          "Moderately bullish / short put-vol with a wing. Same expiration payoff as a call debit spread via put-call parity, often with different margin and liquidity.",
          putCreditSpread(
            shortPutLeg.strike,
            shortP,
            longPutWing.strike,
            longP
          ),
          lookup,
          preferred === "put_credit_spread"
        )
      );
    }
  }

  if (
    longPutWing &&
    shortPutLeg &&
    shortCallLeg &&
    longCallWing &&
    longPutWing.strike < shortPutLeg.strike &&
    shortPutLeg.strike < shortCallLeg.strike &&
    shortCallLeg.strike < longCallWing.strike
  ) {
    const lp = premiumFor(longPutWing, "long");
    const sp = premiumFor(shortPutLeg, "short");
    const sc = premiumFor(shortCallLeg, "short");
    const lc = premiumFor(longCallWing, "long");
    if (lp != null && sp != null && sc != null && lc != null) {
      views.push(
        structureView(
          "iron_condor",
          "Iron condor",
          "Defined-risk short volatility. You sell a strangle and buy a wider one as wings. Gap risk is capped. Buying the wings costs some VRP edge — that is the point.",
          ironCondor({
            longPutStrike: longPutWing.strike,
            longPutPremium: lp,
            shortPutStrike: shortPutLeg.strike,
            shortPutPremium: sp,
            shortCallStrike: shortCallLeg.strike,
            shortCallPremium: sc,
            longCallStrike: longCallWing.strike,
            longCallPremium: lc,
          }),
          lookup,
          preferred === "iron_condor"
        )
      );
    }
  }

  if (shortCallLeg) {
    const premium = premiumFor(shortCallLeg, "short");
    if (premium != null) {
      views.push(
        structureView(
          "covered_call",
          "Covered call overlay",
          "Short a ~30-delta call against 100 shares you already own. Payoff matches a cash-secured put at the same strike. You cap upside for a credit — this is not free yield; it is short upside volatility.",
          shortCall(shortCallLeg.strike, premium),
          lookup,
          false
        )
      );
    }
  }

  if (shortPutLeg) {
    const premium = premiumFor(shortPutLeg, "short");
    if (premium != null) {
      views.push(
        structureView(
          "cash_secured_put",
          "Cash-secured put",
          "Bullish-to-neutral: collect premium and accept the obligation to buy stock at the strike. Economically the same as a covered call. Risk is the stock falling, not 'theta income'.",
          shortPut(shortPutLeg.strike, premium),
          lookup,
          false
        )
      );
    }
  }

  return views.filter((row): row is OptionStructureView => row != null);
}

async function nextEarningsDate(symbol: string): Promise<string | null> {
  try {
    const summary = await cached(
      `summary:${symbol}:calendar`,
      TTL.quoteSummary,
      () => yahooFinance.quoteSummary(symbol, { modules: ["calendarEvents"] })
    );
    const calendar = summary.calendarEvents as
      | { earnings?: { earningsDate?: Array<Date | string | number> } }
      | undefined;
    const dates = calendar?.earnings?.earningsDate ?? [];
    const isos = dates
      .map((date) => toIsoDate(date))
      .filter((date): date is string => date != null)
      .sort();
    const today = new Date().toISOString().slice(0, 10);
    return isos.find((date) => date >= today) ?? isos[0] ?? null;
  } catch {
    return null;
  }
}

export async function buildOptionsDesk(
  symbol: string,
  expiryIso?: string
): Promise<OptionsDeskSnapshot> {
  const upper = symbol.trim().toUpperCase();
  if (!upper) throw new Error("Missing symbol");

  const [history, quote, rateInfo, index, earningsDate] = await Promise.all([
    fetchDailyHistory(upper),
    fetchQuote(upper),
    fetchRiskFreeRate(),
    fetchRawChain(upper),
    nextEarningsDate(upper),
  ]);

  const spot =
    asNum(quote.regularMarketPrice) ??
    asNum(index.quote?.regularMarketPrice) ??
    (history.at(-1)?.close ?? null);
  if (spot == null || !(spot > 0)) {
    throw new Error(`No live price for ${upper}`);
  }

  const expirationDates = (index.expirationDates ?? []).filter(
    (date): date is Date => date instanceof Date
  );
  if (expirationDates.length === 0) {
    throw new Error(`No listed options for ${upper}`);
  }

  const now = new Date();
  let picked = pickExpirationDates(expirationDates, now);
  if (expiryIso) {
    const wanted = expirationDates.find(
      (date) => date.toISOString().slice(0, 10) === expiryIso
    );
    if (wanted && !picked.some((date) => date.getTime() === wanted.getTime())) {
      picked = [wanted, ...picked].slice(0, 7);
    }
  }

  const chains = await Promise.all(
    picked.map(async (date) => {
      const iso = date.toISOString().slice(0, 10);
      const indexIso = toIsoDate(index.options?.[0]?.expirationDate);
      const raw = iso === indexIso ? index : await fetchRawChain(upper, date);
      const expiry = raw.options?.[0];
      return { iso, expiry };
    })
  );

  const rate = rateInfo.rate;
  const quoteFields = quote as Record<string, unknown>;
  const dividendYield = asUnit(
    quoteFields.trailingAnnualDividendYield ??
      quoteFields.dividendYield ??
      index.quote?.trailingAnnualDividendYield
  );

  const expiryRows = chains.map(({ iso, expiry }) => {
    const dte = calendarDte(iso, now);
    const timeYears = timeYearsFromDays(Math.max(dte, 1));
    const rows = expiry
      ? rowsFromExpiry(expiry, spot, timeYears, rate, dividendYield)
      : [];
    const atm = atmFromRows(rows, spot);
    return { iso, dte, rows, atm };
  });

  const selectedIso =
    expiryIso && expiryRows.some((row) => row.iso === expiryIso)
      ? expiryIso
      : (nearestBy(expiryRows, 30, (row) => row.dte)?.iso ?? expiryRows[0].iso);
  const selected =
    expiryRows.find((row) => row.iso === selectedIso) ?? expiryRows[0];

  const termPoints: TermPoint[] = expiryRows
    .filter((row) => row.atm?.iv != null)
    .map((row) => ({
      expiration: row.iso,
      dte: row.dte,
      atmIv: row.atm!.iv as number,
    }));

  const expirations: OptionExpirationMeta[] = (index.expirationDates ?? [])
    .map((date) => toIsoDate(date))
    .filter((iso): iso is string => iso != null)
    .map((expiration) => {
      const loaded = expiryRows.find((row) => row.iso === expiration);
      return {
        expiration,
        dte: calendarDte(expiration, now),
        atmIv: loaded?.atm?.iv ?? null,
        atmStrike: loaded?.atm?.strike ?? null,
      };
    })
    .filter((row) => row.dte >= 0);

  const windows = realizedVolWindows(history);
  const byLookback = new Map(
    windows.map((window) => [window.lookbackDays, window])
  );
  const rv30 = byLookback.get(30)?.preferred ?? null;
  const rvEstimator = byLookback.get(30)?.estimator ?? null;

  const atmIv = selected.atm?.iv ?? null;
  const termShape = classifyTermStructure(termPoints);
  const slope = termSlopePerMonth(termPoints);
  const near = termPoints.find((point) => point.dte > 0);
  const far = [...termPoints]
    .reverse()
    .find((point) => near && point.dte > near.dte);
  const fwd =
    near && far
      ? forwardVolatility(
          near.atmIv,
          near.dte / 365.25,
          far.atmIv,
          far.dte / 365.25
        )
      : null;

  const rvHistory = rollingCloseToClose(history, 20);
  const ivPct = percentileRank(rvHistory, atmIv ?? Number.NaN);

  const atmCall = selected.atm?.call ?? null;
  const atmPut = selected.atm?.put ?? null;
  const atmSpreadPct =
    atmCall?.spreadPct != null && atmPut?.spreadPct != null
      ? Math.max(atmCall.spreadPct, atmPut.spreadPct)
      : (atmCall?.spreadPct ?? atmPut?.spreadPct ?? null);
  const atmOi =
    (atmCall?.openInterest ?? 0) + (atmPut?.openInterest ?? 0) || null;

  const put25 = nearestBy(
    selected.rows
      .map((row) => row.put)
      .filter((row): row is OptionContract => row != null),
    -0.25,
    (row) => row.delta
  );
  const call25 = nearestBy(
    selected.rows
      .map((row) => row.call)
      .filter((row): row is OptionContract => row != null),
    0.25,
    (row) => row.delta
  );

  const earningsInWindow =
    earningsDate != null &&
    calendarDte(earningsDate, now) <= selected.dte &&
    calendarDte(earningsDate, now) >= 0;

  const stance = volStance({
    atmIv,
    rv30,
    term: termShape,
    ivPercentile: ivPct,
    atmSpreadPct,
    atmOpenInterest: atmOi,
    earningsInWindow,
    hasDefinedRiskStrikes: selected.rows.length >= 8,
  });

  const structures = buildStructuresFromChain(
    selected.rows,
    stance.preferredStructure
  );

  const name =
    (typeof quote.shortName === "string" && quote.shortName) ||
    (typeof quote.longName === "string" && quote.longName) ||
    upper;

  return {
    symbol: upper,
    name,
    spot,
    currency: typeof quote.currency === "string" ? quote.currency : "USD",
    changePercent: asNum(quote.regularMarketChangePercent) ?? 0,
    rate,
    rateSource: rateInfo.source,
    dividendYield,
    selectedExpiration: selected.iso,
    selectedDte: selected.dte,
    expirations,
    termShape,
    termSlopePerMonth: slope,
    forwardVol: fwd,
    atmIv,
    atmStrike: selected.atm?.strike ?? null,
    rv: {
      d10: byLookback.get(10)?.preferred ?? null,
      d20: byLookback.get(20)?.preferred ?? null,
      d30: rv30,
      d60: byLookback.get(60)?.preferred ?? null,
      d90: byLookback.get(90)?.preferred ?? null,
      estimator: rvEstimator,
    },
    ivRvRatio: ivRvRatio(atmIv, rv30),
    vrp: atmIv != null && rv30 != null ? atmIv - rv30 : null,
    ivPercentile: ivPct,
    expectedDailyMove: atmIv != null ? ruleOf16DailyMove(atmIv) : null,
    expectedMoveToExpiry:
      atmIv != null
        ? expectedMove(spot, atmIv, Math.max(selected.dte, 1))
        : null,
    skew: {
      putIv: put25?.iv ?? null,
      callIv: call25?.iv ?? null,
      riskReversal:
        put25?.iv != null && call25?.iv != null ? put25.iv - call25.iv : null,
      putDelta: put25?.delta ?? null,
      callDelta: call25?.delta ?? null,
    },
    stance: stance.stance,
    preferredStructure: stance.preferredStructure,
    reasons: stance.reasons,
    warnings: stance.warnings,
    earningsDate,
    earningsInWindow,
    chain: selected.rows,
    structures,
    modelNote:
      "Greeks and inverted IV use Black–Scholes–Merton (European, constant vol). Listed equity options are American; early-exercise value is not in these numbers. The model translates the chain into IV and risk — it does not say what an option 'should' cost.",
    asOf: new Date().toISOString(),
  };
}
