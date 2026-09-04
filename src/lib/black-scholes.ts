/**
 * Black–Scholes–Merton as a translator, not a crystal ball.
 *
 * The market sets the premium. We invert that premium for implied volatility
 * and read the Greeks as a risk dashboard. Listed equity options are American;
 * this closed form is European. Treat the numbers as a language, not a fair
 * value the market is "wrong" about.
 */

export type OptionType = "call" | "put";

export interface BlackScholesInput {
  type: OptionType;
  spot: number;
  strike: number;
  timeYears: number;
  rate: number;
  dividendYield: number;
  volatility: number;
}

export interface BlackScholesGreeks {
  price: number;
  delta: number;
  gamma: number;
  /** Calendar-day theta (price change per day, other inputs held fixed). */
  theta: number;
  /** Price change per 1 volatility point (0.01 in decimal vol). */
  vega: number;
  /** Price change per 1 percentage-point change in the rate. */
  rho: number;
  d1: number;
  d2: number;
}

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const INV_SQRT2 = 1 / Math.SQRT2;

/** A&S 7.1.26; absolute error under 1.5e-7. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax));
  return sign * y;
}

export function normCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  return 0.5 * (1 + erf(x * INV_SQRT2));
}

export function normPdf(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

export function intrinsicValue(
  type: OptionType,
  spot: number,
  strike: number
): number {
  if (!(spot > 0) || !(strike > 0)) return 0;
  return type === "call"
    ? Math.max(0, spot - strike)
    : Math.max(0, strike - spot);
}

export function timeYearsFromDays(calendarDays: number): number {
  if (!Number.isFinite(calendarDays) || calendarDays <= 0) return 1 / 365.25;
  return calendarDays / 365.25;
}

function d1d2(input: BlackScholesInput): { d1: number; d2: number } | null {
  const { spot, strike, timeYears, rate, dividendYield, volatility } = input;
  if (
    !(spot > 0) ||
    !(strike > 0) ||
    !(timeYears > 0) ||
    !(volatility > 0) ||
    !Number.isFinite(rate) ||
    !Number.isFinite(dividendYield)
  ) {
    return null;
  }

  const sqrtT = Math.sqrt(timeYears);
  const d1 =
    (Math.log(spot / strike) +
      (rate - dividendYield + 0.5 * volatility * volatility) * timeYears) /
    (volatility * sqrtT);
  return { d1, d2: d1 - volatility * sqrtT };
}

export function blackScholesPrice(input: BlackScholesInput): number | null {
  const greeks = blackScholesGreeks(input);
  return greeks?.price ?? null;
}

export function blackScholesGreeks(
  input: BlackScholesInput
): BlackScholesGreeks | null {
  const pair = d1d2(input);
  if (!pair) return null;

  const { type, spot, strike, timeYears, rate, dividendYield, volatility } =
    input;
  const { d1, d2 } = pair;
  const sqrtT = Math.sqrt(timeYears);
  const discQ = Math.exp(-dividendYield * timeYears);
  const discR = Math.exp(-rate * timeYears);
  const nd1 = normCdf(d1);
  const nd2 = normCdf(d2);
  const nPd1 = normPdf(d1);

  const call =
    spot * discQ * nd1 - strike * discR * nd2;
  const put =
    strike * discR * normCdf(-d2) - spot * discQ * normCdf(-d1);
  const price = type === "call" ? call : put;

  const delta = type === "call" ? discQ * nd1 : discQ * (nd1 - 1);
  const gamma = discQ * nPd1 / (spot * volatility * sqrtT);
  const vegaDecimal = spot * discQ * nPd1 * sqrtT;

  const thetaCall =
    (-spot * discQ * nPd1 * volatility) / (2 * sqrtT) -
    rate * strike * discR * nd2 +
    dividendYield * spot * discQ * nd1;
  const thetaPut =
    (-spot * discQ * nPd1 * volatility) / (2 * sqrtT) +
    rate * strike * discR * normCdf(-d2) -
    dividendYield * spot * discQ * normCdf(-d1);
  const thetaYear = type === "call" ? thetaCall : thetaPut;

  const rhoCall = strike * timeYears * discR * nd2;
  const rhoPut = -strike * timeYears * discR * normCdf(-d2);
  const rhoYear = type === "call" ? rhoCall : rhoPut;

  return {
    price,
    delta,
    gamma,
    theta: thetaYear / 365,
    vega: vegaDecimal / 100,
    rho: rhoYear / 100,
    d1,
    d2,
  };
}

const IV_MIN = 1e-4;
const IV_MAX = 5;

/**
 * Invert a market premium for Black–Scholes implied volatility.
 * Returns null when the quote cannot be mapped (below intrinsic, no time, etc.).
 */
export function impliedVolatility(input: {
  type: OptionType;
  spot: number;
  strike: number;
  timeYears: number;
  rate: number;
  dividendYield: number;
  price: number;
}): number | null {
  const { price, ...rest } = input;
  if (!(price > 0) || !(rest.spot > 0) || !(rest.strike > 0) || !(rest.timeYears > 0)) {
    return null;
  }

  const floor = intrinsicValue(input.type, rest.spot, rest.strike);
  // A quote below discounted intrinsic is an arbitrage or a stale print.
  if (price < floor * 0.5 && price < 0.01) return null;

  const at = (volatility: number) =>
    blackScholesPrice({ ...rest, type: input.type, volatility });

  const lowPrice = at(IV_MIN);
  const highPrice = at(IV_MAX);
  if (lowPrice == null || highPrice == null) return null;
  if (price <= lowPrice) return IV_MIN;
  if (price >= highPrice) return IV_MAX;

  let sigma = Math.min(
    IV_MAX,
    Math.max(0.15, Math.sqrt((2 * Math.PI) / rest.timeYears) * (price / rest.spot))
  );

  for (let i = 0; i < 12; i++) {
    const greeks = blackScholesGreeks({
      ...rest,
      type: input.type,
      volatility: sigma,
    });
    if (!greeks || greeks.vega < 1e-12) break;
    const next = sigma - (greeks.price - price) / (greeks.vega * 100);
    if (!Number.isFinite(next)) break;
    sigma = Math.min(IV_MAX, Math.max(IV_MIN, next));
    if (Math.abs(greeks.price - price) < 1e-6) return sigma;
  }

  let lo = IV_MIN;
  let hi = IV_MAX;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    const model = at(mid);
    if (model == null) return null;
    if (Math.abs(model - price) < 1e-7) return mid;
    if (model > price) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

export function midPrice(bid: number | null, ask: number | null, last: number | null): number | null {
  if (bid != null && ask != null && bid > 0 && ask > 0 && ask >= bid) {
    return (bid + ask) / 2;
  }
  if (last != null && last > 0) return last;
  if (bid != null && bid > 0) return bid;
  if (ask != null && ask > 0) return ask;
  return null;
}
