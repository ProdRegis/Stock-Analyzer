/**
 * Reverse DCF: given cash-flow assumptions, what return is the market
 * already pricing in?
 *
 * Project owner earnings (or FCF) with growth fading to a terminal rate,
 * discount back, and solve for the rate that makes present value equal
 * today's enterprise value or market cap. A high implied return on
 * conservative growth is attractive; a low implied return on aggressive
 * growth is not.
 */

export interface ReverseDcfInput {
  /** Trailing owner earnings or free cash flow. Must be positive. */
  startingCashFlow: number;
  /** Today's value those cash flows are being priced against (EV or market cap). */
  marketValue: number;
  /** Year-1 growth before the fade. */
  initialGrowth: number;
  /** Perpetual growth after the explicit window. */
  terminalGrowth: number;
  /** Explicit forecast years, including the year the terminal value is taken. */
  years: number;
}

export interface ReverseDcfResult {
  impliedReturn: number;
  /** Present value of the projected cash flows at a chosen discount rate. */
  valueAtRate: (rate: number) => number;
}

const MIN_RATE = 0.005;
const MAX_RATE = 0.8;
const RATE_TOLERANCE = 1e-5;

function clampGrowth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.4, Math.max(-0.2, value));
}

/**
 * Linear fade from initial growth to terminal growth across `years`.
 * Year 1 uses initialGrowth; year `years` uses terminalGrowth.
 */
export function fadedGrowthRates(
  initialGrowth: number,
  terminalGrowth: number,
  years: number
): number[] {
  const start = clampGrowth(initialGrowth);
  const end = clampGrowth(terminalGrowth);
  if (years <= 1) return [start];

  return Array.from({ length: years }, (_, index) => {
    const t = index / (years - 1);
    return start + (end - start) * t;
  });
}

export function projectCashFlows(
  startingCashFlow: number,
  rates: number[]
): number[] {
  const flows: number[] = [];
  let cash = startingCashFlow;
  for (const rate of rates) {
    cash *= 1 + rate;
    flows.push(cash);
  }
  return flows;
}

export function terminalValue(
  lastCashFlow: number,
  terminalGrowth: number,
  discountRate: number
): number {
  const g = clampGrowth(terminalGrowth);
  if (discountRate <= g) return lastCashFlow * (1 + g) / RATE_TOLERANCE;
  return (lastCashFlow * (1 + g)) / (discountRate - g);
}

export function presentValue(
  cashFlows: number[],
  terminal: number,
  discountRate: number
): number {
  let pv = 0;
  for (let year = 1; year <= cashFlows.length; year++) {
    pv += cashFlows[year - 1] / (1 + discountRate) ** year;
  }
  pv += terminal / (1 + discountRate) ** cashFlows.length;
  return pv;
}

function valueAt(
  input: ReverseDcfInput,
  discountRate: number
): number {
  const rates = fadedGrowthRates(
    input.initialGrowth,
    input.terminalGrowth,
    input.years
  );
  const flows = projectCashFlows(input.startingCashFlow, rates);
  const last = flows[flows.length - 1] ?? input.startingCashFlow;
  const terminal = terminalValue(last, input.terminalGrowth, discountRate);
  return presentValue(flows, terminal, discountRate);
}

/**
 * Solve for the discount rate that sets PV(cash flows) = marketValue.
 * Returns null when cash flow or market value is not usable.
 */
export function impliedReturn(input: ReverseDcfInput): number | null {
  if (
    !(input.startingCashFlow > 0) ||
    !(input.marketValue > 0) ||
    input.years < 1
  ) {
    return null;
  }

  const target = input.marketValue;
  let low = MIN_RATE;
  let high = MAX_RATE;

  const valueLow = valueAt(input, low);
  const valueHigh = valueAt(input, high);

  // Higher discount rate → lower present value. If even 80% still overshoots
  // the market value, the name is extremely cheap (or the cash flow is huge).
  if (valueHigh > target) return high;
  if (valueLow < target) return low;

  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    const value = valueAt(input, mid);
    if (Math.abs(value - target) / target < RATE_TOLERANCE) return mid;
    if (value > target) low = mid;
    else high = mid;
  }

  return (low + high) / 2;
}

export function valueAtDiscountRate(
  input: ReverseDcfInput,
  rate: number
): number {
  return valueAt(input, rate);
}

/**
 * Haircut a reported growth rate into something you'd actually type into a
 * model: cap it, then take 70%. Negative growth is floored at zero in the
 * base case so a one-year dip does not become a perpetual decline.
 */
export function conservativeGrowth(reported: number | null): number {
  if (reported == null || !Number.isFinite(reported)) return 0.03;
  const capped = Math.min(0.15, Math.max(-0.05, reported));
  const haircut = capped * 0.7;
  return Math.max(0, haircut);
}
