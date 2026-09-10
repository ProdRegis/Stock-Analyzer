/**
 * Option structures as tools, not strategies.
 *
 * A structure is a payoff shape and a set of Greek exposures. A strategy is a
 * thesis (usually IV versus forecast RV) expressed with that tool. Payoffs
 * here are expiration P&L for one spread, multiplier 100 unless noted.
 */

import { blackScholesPrice, type OptionType } from "./black-scholes";

export type OptionSide = "long" | "short";

export interface StructureLeg {
  type: OptionType;
  side: OptionSide;
  strike: number;
  /** Per-share premium paid (long) or received (short). */
  premium: number;
  quantity: number;
  /** Decimal IV used to mark the leg before expiry. */
  iv?: number | null;
}

export interface ExpirationStats {
  netPremium: number;
  debitCredit: "debit" | "credit";
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
  definedRisk: boolean;
  capitalAtRisk: number | null;
  /** Signed expiration P&L in dollars at a few spots, for charts. */
  payoff: Array<{ price: number; pnl: number }>;
}

export const EQUITY_MULTIPLIER = 100;

function signedQty(leg: StructureLeg): number {
  return (leg.side === "long" ? 1 : -1) * leg.quantity;
}

/** Expiration P&L in dollars for one structure. */
export function expirationPnl(
  spot: number,
  legs: StructureLeg[],
  multiplier = EQUITY_MULTIPLIER
): number {
  if (!(spot >= 0) || legs.length === 0) return 0;

  let pnl = 0;
  for (const leg of legs) {
    const intrinsic =
      leg.type === "call"
        ? Math.max(0, spot - leg.strike)
        : Math.max(0, leg.strike - spot);
    pnl += signedQty(leg) * (intrinsic - leg.premium) * multiplier;
  }
  return pnl;
}

function uniqueStrikes(legs: StructureLeg[]): number[] {
  return [...new Set(legs.map((leg) => leg.strike))].sort((a, b) => a - b);
}

function terminalCallSlope(legs: StructureLeg[], multiplier: number): number {
  let slope = 0;
  for (const leg of legs) {
    if (leg.type === "call") slope += signedQty(leg) * multiplier;
  }
  return slope;
}

function findBreakevens(
  legs: StructureLeg[],
  multiplier: number
): number[] {
  const strikes = uniqueStrikes(legs);
  if (strikes.length === 0) return [];

  const high = strikes[strikes.length - 1] * 2 + 1;
  const points = [0, ...strikes, high];
  const breakevens: number[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const left = points[i];
    const right = points[i + 1];
    const pnlL = expirationPnl(left, legs, multiplier);
    const pnlR = expirationPnl(right, legs, multiplier);
    if (Math.abs(pnlL) < 1e-6) {
      if (!breakevens.some((value) => Math.abs(value - left) < 1e-6)) {
        breakevens.push(left);
      }
      continue;
    }
    if (pnlL * pnlR < 0) {
      const t = pnlL / (pnlL - pnlR);
      breakevens.push(left + t * (right - left));
    }
  }

  const pnlHigh = expirationPnl(high, legs, multiplier);
  if (Math.abs(pnlHigh) < 1e-6) breakevens.push(high);

  return breakevens.filter((value) => value >= 0);
}

export function payoffGrid(legs: StructureLeg[], steps = 61): number[] {
  const strikes = uniqueStrikes(legs);
  const mid = strikes[Math.floor(strikes.length / 2)] ?? 100;
  const lo = Math.max(0, Math.min(strikes[0] ?? mid * 0.7, mid * 0.7));
  const hi = Math.max(strikes[strikes.length - 1] ?? mid * 1.3, mid * 1.3);
  const span = Math.max(hi - lo, mid * 0.4);
  const start = Math.max(0, mid - span);
  const end = mid + span;
  const points: number[] = [];
  for (let i = 0; i < steps; i++) {
    points.push(start + (i / (steps - 1)) * (end - start));
  }
  return points;
}

function payoffCurve(
  legs: StructureLeg[],
  multiplier: number,
  steps = 61
): Array<{ price: number; pnl: number }> {
  return payoffGrid(legs, steps).map((price) => ({
    price,
    pnl: expirationPnl(price, legs, multiplier),
  }));
}

export interface MarkToModelEnv {
  timeYears: number;
  rate: number;
  dividendYield: number;
  /** Additive shock to each leg's IV, e.g. 0.05 = +5 vol points. */
  volShock?: number;
  multiplier?: number;
}

/** Instantaneous P&L: mark each leg with BSM at the current remaining T and IV. */
export function markToModelPnl(
  spot: number,
  legs: StructureLeg[],
  env: MarkToModelEnv
): number | null {
  if (!(spot >= 0) || legs.length === 0) return 0;
  const multiplier = env.multiplier ?? EQUITY_MULTIPLIER;
  const shock = env.volShock ?? 0;
  let pnl = 0;
  for (const leg of legs) {
    const iv = (leg.iv ?? null) != null ? (leg.iv as number) + shock : null;
    if (iv == null || !(iv > 0)) return null;
    const marked = blackScholesPrice({
      type: leg.type,
      spot,
      strike: leg.strike,
      timeYears: env.timeYears,
      rate: env.rate,
      dividendYield: env.dividendYield,
      volatility: iv,
    });
    if (marked == null) return null;
    pnl += signedQty(leg) * (marked - leg.premium) * multiplier;
  }
  return pnl;
}

export function structureCurves(
  legs: StructureLeg[],
  env: MarkToModelEnv,
  steps = 61
): Array<{
  price: number;
  expiration: number;
  live: number | null;
  shock: number | null;
}> {
  const multiplier = env.multiplier ?? EQUITY_MULTIPLIER;
  const shockedEnv = { ...env, volShock: (env.volShock ?? 0) + 0.05 };
  return payoffGrid(legs, steps).map((price) => ({
    price,
    expiration: expirationPnl(price, legs, multiplier),
    live: markToModelPnl(price, legs, env),
    shock: markToModelPnl(price, legs, shockedEnv),
  }));
}

export function expirationStats(
  legs: StructureLeg[],
  multiplier = EQUITY_MULTIPLIER
): ExpirationStats {
  const netCash =
    -legs.reduce(
      (sum, leg) => sum + signedQty(leg) * leg.premium * multiplier,
      0
    );
  const debitCredit: "debit" | "credit" = netCash <= 0 ? "debit" : "credit";
  const netPremium = Math.abs(netCash / multiplier);

  const strikes = uniqueStrikes(legs);
  const samples = [0, ...strikes];
  if (strikes.length > 0) {
    samples.push(strikes[strikes.length - 1] * 3);
  }

  let maxProfit: number | null = -Infinity;
  let maxLoss: number | null = Infinity;
  for (const price of samples) {
    const pnl = expirationPnl(price, legs, multiplier);
    maxProfit = Math.max(maxProfit ?? pnl, pnl);
    maxLoss = Math.min(maxLoss ?? pnl, pnl);
  }

  const slope = terminalCallSlope(legs, multiplier);
  if (slope > 1e-6) maxProfit = null;
  if (slope < -1e-6) maxLoss = null;

  const definedRisk = maxLoss != null;
  const capitalAtRisk =
    maxLoss != null ? Math.abs(Math.min(0, maxLoss)) : null;

  return {
    netPremium,
    debitCredit,
    maxProfit,
    maxLoss,
    breakevens: findBreakevens(legs, multiplier),
    definedRisk,
    capitalAtRisk,
    payoff: payoffCurve(legs, multiplier),
  };
}

export function longCall(strike: number, premium: number): StructureLeg[] {
  return [{ type: "call", side: "long", strike, premium, quantity: 1 }];
}

export function longPut(strike: number, premium: number): StructureLeg[] {
  return [{ type: "put", side: "long", strike, premium, quantity: 1 }];
}

export function shortCall(strike: number, premium: number): StructureLeg[] {
  return [{ type: "call", side: "short", strike, premium, quantity: 1 }];
}

export function shortPut(strike: number, premium: number): StructureLeg[] {
  return [{ type: "put", side: "short", strike, premium, quantity: 1 }];
}

export function longStraddle(
  strike: number,
  callPremium: number,
  putPremium: number
): StructureLeg[] {
  return [
    { type: "call", side: "long", strike, premium: callPremium, quantity: 1 },
    { type: "put", side: "long", strike, premium: putPremium, quantity: 1 },
  ];
}

export function shortStraddle(
  strike: number,
  callPremium: number,
  putPremium: number
): StructureLeg[] {
  return [
    { type: "call", side: "short", strike, premium: callPremium, quantity: 1 },
    { type: "put", side: "short", strike, premium: putPremium, quantity: 1 },
  ];
}

export function longStrangle(
  putStrike: number,
  putPremium: number,
  callStrike: number,
  callPremium: number
): StructureLeg[] {
  return [
    { type: "put", side: "long", strike: putStrike, premium: putPremium, quantity: 1 },
    { type: "call", side: "long", strike: callStrike, premium: callPremium, quantity: 1 },
  ];
}

export function callDebitSpread(
  longStrike: number,
  longPremium: number,
  shortStrike: number,
  shortPremium: number
): StructureLeg[] {
  return [
    { type: "call", side: "long", strike: longStrike, premium: longPremium, quantity: 1 },
    { type: "call", side: "short", strike: shortStrike, premium: shortPremium, quantity: 1 },
  ];
}

export function putCreditSpread(
  shortStrike: number,
  shortPremium: number,
  longStrike: number,
  longPremium: number
): StructureLeg[] {
  return [
    { type: "put", side: "short", strike: shortStrike, premium: shortPremium, quantity: 1 },
    { type: "put", side: "long", strike: longStrike, premium: longPremium, quantity: 1 },
  ];
}

/** Robinhood Level 3: sell the lower call, buy the higher call. */
export function callCreditSpread(
  shortStrike: number,
  shortPremium: number,
  longStrike: number,
  longPremium: number
): StructureLeg[] {
  return [
    { type: "call", side: "short", strike: shortStrike, premium: shortPremium, quantity: 1 },
    { type: "call", side: "long", strike: longStrike, premium: longPremium, quantity: 1 },
  ];
}

/** Robinhood Level 3: buy the higher put, sell the lower put. */
export function putDebitSpread(
  longStrike: number,
  longPremium: number,
  shortStrike: number,
  shortPremium: number
): StructureLeg[] {
  return [
    { type: "put", side: "long", strike: longStrike, premium: longPremium, quantity: 1 },
    { type: "put", side: "short", strike: shortStrike, premium: shortPremium, quantity: 1 },
  ];
}

export function ironCondor(input: {
  longPutStrike: number;
  longPutPremium: number;
  shortPutStrike: number;
  shortPutPremium: number;
  shortCallStrike: number;
  shortCallPremium: number;
  longCallStrike: number;
  longCallPremium: number;
}): StructureLeg[] {
  return [
    { type: "put", side: "long", strike: input.longPutStrike, premium: input.longPutPremium, quantity: 1 },
    { type: "put", side: "short", strike: input.shortPutStrike, premium: input.shortPutPremium, quantity: 1 },
    { type: "call", side: "short", strike: input.shortCallStrike, premium: input.shortCallPremium, quantity: 1 },
    { type: "call", side: "long", strike: input.longCallStrike, premium: input.longCallPremium, quantity: 1 },
  ];
}

export function coveredCall(
  shortCallStrike: number,
  shortCallPremium: number
): StructureLeg[] {
  // Stock is not an option leg; expiration P&L of the call overlay only.
  // Combined stock+call payoff is handled by the caller adding (spot - entry).
  return shortCall(shortCallStrike, shortCallPremium);
}

export function cashSecuredPut(
  strike: number,
  premium: number
): StructureLeg[] {
  return shortPut(strike, premium);
}
