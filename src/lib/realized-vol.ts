/**
 * Realized-volatility estimators.
 *
 * Close-to-close is the naive baseline. Range-based estimators (Parkinson,
 * Garman–Klass, Yang–Zhang) pull more information from the same bars.
 * All of these are estimates of a latent process — there is no single
 * correct RV number. Annualization uses 252 trading days.
 */

import { logDailyReturns, stdDev } from "./risk";
import type { PricePoint } from "./types";

const TRADING_DAYS = 252;

export interface RealizedVolWindow {
  lookbackDays: number;
  sampleDays: number;
  closeToClose: number | null;
  parkinson: number | null;
  garmanKlass: number | null;
  yangZhang: number | null;
  /** Preferred point estimate: Yang–Zhang when it is identified, else GK, else close-to-close. */
  preferred: number | null;
  estimator: "yang-zhang" | "garman-klass" | "close-to-close" | null;
}

function validBar(point: PricePoint): boolean {
  return (
    point.open > 0 &&
    point.high > 0 &&
    point.low > 0 &&
    point.close > 0 &&
    point.high >= point.low &&
    point.high >= Math.max(point.open, point.close) * 0.999 &&
    point.low <= Math.min(point.open, point.close) * 1.001
  );
}

function annualize(dailyVol: number | null): number | null {
  if (dailyVol == null || !Number.isFinite(dailyVol) || dailyVol < 0) return null;
  return dailyVol * Math.sqrt(TRADING_DAYS);
}

export function closeToCloseVol(bars: PricePoint[]): number | null {
  const closes = bars.map((bar) => bar.close).filter((close) => close > 0);
  const returns = logDailyReturns(closes);
  if (returns.length < 5) return null;
  return annualize(stdDev(returns));
}

/** Parkinson: uses the high–low range. Ignores overnight gaps. */
export function parkinsonVol(bars: PricePoint[]): number | null {
  const valid = bars.filter(validBar);
  if (valid.length < 5) return null;

  let sum = 0;
  for (const bar of valid) {
    const range = Math.log(bar.high / bar.low);
    sum += range * range;
  }
  const variance = sum / (4 * valid.length * Math.log(2));
  if (!(variance >= 0)) return null;
  return annualize(Math.sqrt(variance));
}

/** Garman–Klass: open/high/low/close. Still ignores overnight gaps. */
export function garmanKlassVol(bars: PricePoint[]): number | null {
  const valid = bars.filter(validBar);
  if (valid.length < 5) return null;

  const coeff = 2 * Math.log(2) - 1;
  let sum = 0;
  for (const bar of valid) {
    const hl = Math.log(bar.high / bar.low);
    const co = Math.log(bar.close / bar.open);
    sum += 0.5 * hl * hl - coeff * co * co;
  }
  const variance = sum / valid.length;
  if (!(variance > 0)) return null;
  return annualize(Math.sqrt(variance));
}

/**
 * Yang–Zhang: overnight gap + open-to-close + Rogers–Satchell range.
 * Generally the most efficient of this set when jumps are present.
 */
export function yangZhangVol(bars: PricePoint[]): number | null {
  const valid = bars.filter(validBar);
  if (valid.length < 6) return null;

  const overnight: number[] = [];
  const openClose: number[] = [];
  let rsSum = 0;
  let rsN = 0;

  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1];
    const bar = valid[i];
    overnight.push(Math.log(bar.open / prev.close));
    openClose.push(Math.log(bar.close / bar.open));
    const hc = Math.log(bar.high / bar.close);
    const ho = Math.log(bar.high / bar.open);
    const lc = Math.log(bar.low / bar.close);
    const lo = Math.log(bar.low / bar.open);
    rsSum += hc * ho + lc * lo;
    rsN += 1;
  }

  const n = overnight.length;
  if (n < 5 || rsN < 5) return null;

  const varSample = (values: number[]) => {
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    return (
      values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
      (values.length - 1)
    );
  };

  const overnightVar = varSample(overnight);
  const openCloseVar = varSample(openClose);
  const rsVar = rsSum / rsN;
  const k = 0.34 / (1.34 + (n + 1) / (n - 1));
  const variance = overnightVar + k * openCloseVar + (1 - k) * rsVar;
  if (!(variance > 0)) return null;
  return annualize(Math.sqrt(variance));
}

export function realizedVolWindow(
  history: PricePoint[],
  lookbackDays: number
): RealizedVolWindow {
  const bars = history.slice(-lookbackDays - 1);
  const closeToClose = closeToCloseVol(bars);
  const parkinson = parkinsonVol(bars);
  const garmanKlass = garmanKlassVol(bars);
  const yangZhang = yangZhangVol(bars);

  const preferred = yangZhang ?? garmanKlass ?? closeToClose;
  const estimator =
    yangZhang != null
      ? "yang-zhang"
      : garmanKlass != null
        ? "garman-klass"
        : closeToClose != null
          ? "close-to-close"
          : null;

  return {
    lookbackDays,
    sampleDays: Math.max(0, bars.length - 1),
    closeToClose,
    parkinson,
    garmanKlass,
    yangZhang,
    preferred,
    estimator,
  };
}

export const RV_LOOKBACKS = [10, 20, 30, 60, 90] as const;

export function realizedVolWindows(
  history: PricePoint[]
): RealizedVolWindow[] {
  return RV_LOOKBACKS.map((lookback) => realizedVolWindow(history, lookback));
}

/**
 * Rule of 16: annualized vol / 16 ≈ expected 1-sigma daily move.
 * √252 ≈ 15.87, so 16 is the trading shortcut.
 */
export function ruleOf16DailyMove(annualVol: number): number | null {
  if (!(annualVol > 0)) return null;
  return annualVol / 16;
}

/** Expected 1-sigma move over `calendarDays` from an annualized vol. */
export function expectedMove(
  spot: number,
  annualVol: number,
  calendarDays: number
): number | null {
  if (!(spot > 0) || !(annualVol > 0) || !(calendarDays > 0)) return null;
  return spot * annualVol * Math.sqrt(calendarDays / 365.25);
}

/**
 * Rank `value` in a historical sample. 1.0 means the value is at the top of
 * the sample. Used as a stand-in for IV percentile when we only have RV history.
 */
export function percentileRank(sample: number[], value: number): number | null {
  const clean = sample.filter((item) => Number.isFinite(item) && item > 0);
  if (clean.length < 10 || !(value > 0)) return null;
  const below = clean.filter((item) => item <= value).length;
  return below / clean.length;
}

export function rollingCloseToClose(
  history: PricePoint[],
  window = 20
): number[] {
  const values: number[] = [];
  if (history.length < window + 1) return values;

  for (let end = window + 1; end <= history.length; end++) {
    const vol = closeToCloseVol(history.slice(end - window - 1, end));
    if (vol != null) values.push(vol);
  }
  return values;
}
