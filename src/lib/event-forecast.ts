import { studentTCdf } from "./stats";
import type {
  BusinessQualityGrade,
  EarningsSurprise,
  EventForecast,
  EventTradeStance,
  PricePoint,
} from "./types";

/** Market-wide EPS beat rate used as a prior when a name has few prints. */
export const EPS_BEAT_PRIOR = 0.67;
/** Strength of that prior, in pseudo-observations. */
const PRIOR_STRENGTH = 8;
/** Shrink the mean surprise toward a typical 3% beat. */
const SURPRISE_PRIOR = 0.03;
const SURPRISE_PRIOR_STRENGTH = 4;
const MIN_EPS_SCALE = 0.05;

export interface SurprisePoint {
  period: string;
  quarter: string | null;
  epsActual: number;
  epsEstimate: number;
}

export interface EarningsForecastInput {
  consensus: number | null;
  low: number | null;
  high: number | null;
  revenueAvg: number | null;
  revenueLow: number | null;
  revenueHigh: number | null;
  yearAgoEps: number | null;
  analystCount: number | null;
  /** Current-quarter consensus minus the 30-day-ago print, if known. */
  revision30d: number | null;
  surprises: SurprisePoint[];
  printMoves: Array<{ surprisePercent: number; nextDayReturn: number }>;
  qualityGrade: BusinessQualityGrade | null;
  atrPercent: number | null;
}

export interface DividendForecastInput {
  annualRate: number | null;
  trailingAnnual: number | null;
  yield: number | null;
  fiveYearAvgYield: number | null;
  payoutRatio: number | null;
  fcfPositive: boolean | null;
  profitable: boolean | null;
  qualityGrade: BusinessQualityGrade | null;
  declared: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const ss = values.reduce((sum, value) => sum + (value - avg) ** 2, 0);
  return Math.sqrt(ss / (values.length - 1));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function money(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function epsScale(estimate: number): number {
  return Math.max(Math.abs(estimate), MIN_EPS_SCALE);
}

/** (actual − estimate) / max(|estimate|, 5¢). */
export function signedSurprise(actual: number, estimate: number): number {
  return (actual - estimate) / epsScale(estimate);
}

export function shrinkMean(sampleMean: number, n: number, prior: number, k: number): number {
  if (n <= 0) return prior;
  return (n * sampleMean + k * prior) / (n + k);
}

/**
 * One-sided predictive probability that the next surprise is at least `threshold`,
 * using a Student-t with location = shrunk mean and scale = s √(1 + 1/n).
 */
export function predictiveChanceAbove(
  values: number[],
  threshold: number,
  priorMean: number
): { chance: number; mean: number; scale: number; df: number } | null {
  if (values.length < 2) return null;

  const n = values.length;
  const mu = shrinkMean(mean(values), n, priorMean, SURPRISE_PRIOR_STRENGTH);
  const s = sampleStdDev(values);
  const scale = Math.max(s * Math.sqrt(1 + 1 / n), 1e-6);
  const df = n - 1;
  const t = (threshold - mu) / scale;
  const chance = 1 - studentTCdf(t, df);
  if (!Number.isFinite(chance)) return null;
  return { chance: clamp(chance, 0.02, 0.98), mean: mu, scale, df };
}

export function betaBinomialBeatRate(beats: number, n: number): number {
  const alpha = EPS_BEAT_PRIOR * PRIOR_STRENGTH + beats;
  const beta = (1 - EPS_BEAT_PRIOR) * PRIOR_STRENGTH + Math.max(0, n - beats);
  return alpha / (alpha + beta);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dailyReturns(history: PricePoint[]): Array<{ date: string; ret: number }> {
  const out: Array<{ date: string; ret: number }> = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]?.close;
    const curr = history[i];
    if (!curr || prev == null || prev <= 0 || curr.close <= 0) continue;
    out.push({ date: curr.date.slice(0, 10), ret: curr.close / prev - 1 });
  }
  return out;
}

/**
 * The earningsHistory row is the quarter end, not the print. The report
 * usually lands 2–8 weeks later; take the most distinctive one-day move
 * in that window if it is clearly larger than a typical day.
 */
export function inferReportMove(
  history: PricePoint[],
  quarterEndIso: string
): { date: string; nextDayReturn: number } | null {
  const quarter = quarterEndIso.slice(0, 10);
  const start = addDays(quarter, 12);
  const end = addDays(quarter, 58);
  const returns = dailyReturns(history);
  if (returns.length < 30) return null;

  const typical = median(returns.map((row) => Math.abs(row.ret)));
  const window = returns.filter((row) => row.date >= start && row.date <= end);
  if (window.length < 3) return null;

  let best = window[0]!;
  for (const row of window) {
    if (Math.abs(row.ret) > Math.abs(best.ret)) best = row;
  }

  if (typical <= 0 || Math.abs(best.ret) < Math.max(0.012, 2 * typical)) {
    return null;
  }
  return { date: best.date, nextDayReturn: best.ret };
}

function confidenceFromSample(
  n: number,
  dispersion: number | null,
  tChance: number | null,
  beatRate: number
): "High" | "Medium" | "Low" {
  if (n < 4) return "Low";
  const disagree =
    tChance != null && Math.abs(tChance - beatRate) > 0.18;
  if (dispersion != null && dispersion > 0.35) return "Low";
  if (n >= 6 && !disagree && (dispersion == null || dispersion < 0.18)) {
    return "High";
  }
  return disagree ? "Low" : "Medium";
}

function earningsStance(input: {
  hitChance: number;
  confidence: "High" | "Medium" | "Low";
  qualityGrade: BusinessQualityGrade | null;
  avgBeatMove: number | null;
  avgMissMove: number | null;
  expectedMove: number | null;
}): {
  stance: EventTradeStance;
  direction: "long" | "short" | "none";
  whenWindow: EventForecast["trade"]["whenWindow"];
  when: string;
  summary: string;
} {
  const grade = input.qualityGrade;
  const pass = grade === "Pass" || grade === "Speculative";
  const move = input.expectedMove ?? 0;
  const coinFlip = input.hitChance > 0.4 && input.hitChance < 0.6;
  const unidentified = input.confidence === "Low" || coinFlip;

  if (pass) {
    return {
      stance: "skip",
      direction: "none",
      whenWindow: "avoid",
      when: "Do not trade this print",
      summary:
        "The business itself is speculative or a pass. An earnings bounce is not a reason to start a position.",
    };
  }

  if (unidentified) {
    return {
      stance: "wait",
      direction: "none",
      whenWindow: "after_event",
      when: "Wait for the print, then reassess",
      summary: `Direction is not identified (hit chance ${pct(input.hitChance)}). The expected ±${pct(move)} move is a coin flip until the number is out.`,
    };
  }

  const beatMove = input.avgBeatMove ?? 0;
  const missMove = input.avgMissMove ?? 0;

  if (input.hitChance >= 0.72 && beatMove > 0.004 && input.confidence !== "Low") {
    const before = input.hitChance >= 0.78 && beatMove > 0.01 && input.confidence === "High";
    return {
      stance: "buy",
      direction: "long",
      whenWindow: before ? "before_event" : "after_event",
      when: before
        ? "Buy in the session before the print"
        : "Wait for a beat, then buy the follow-through",
      summary: before
        ? `This name beats often (${pct(input.hitChance)} model chance) and the average post-beat session is ${pct(beatMove, 1)}. That is the long case — still a binary event, size small.`
        : `The beat case is the base case (${pct(input.hitChance)}), but the average post-beat move is only ${pct(beatMove, 1)}. Do not pay up into the print; buy if they actually beat.`,
    };
  }

  if (input.hitChance <= 0.32 && missMove < -0.004 && input.confidence !== "Low") {
    const before = input.hitChance <= 0.25 && missMove < -0.01 && input.confidence === "High";
    return {
      stance: "short",
      direction: "short",
      whenWindow: before ? "before_event" : "after_event",
      when: before
        ? "Short in the session before the print"
        : "Wait for a miss, then short the follow-through",
      summary: before
        ? `The model puts only ${pct(input.hitChance)} on a beat and the average miss session is ${pct(missMove, 1)}. A small short into the print is the trade — cover if they beat.`
        : `A miss is the base case (${pct(1 - input.hitChance)} miss chance) but not identified well enough to short blindly. Wait for the number.`,
    };
  }

  return {
    stance: "wait",
    direction: "none",
    whenWindow: "after_event",
    when: "Do not buy or short the print",
    summary: `Hit chance ${pct(input.hitChance)} is not extreme, and the historical post-print drift is not a repeatable edge. Treat this as an event to watch, not a ticket.`,
  };
}

export function forecastEarnings(input: EarningsForecastInput): EventForecast {
  const surprises = input.surprises.filter(
    (row) => Number.isFinite(row.epsActual) && Number.isFinite(row.epsEstimate)
  );
  const signed = surprises.map((row) =>
    signedSurprise(row.epsActual, row.epsEstimate)
  );
  const beats = surprises.filter(
    (row) => row.epsActual >= row.epsEstimate - 1e-9
  ).length;
  const n = surprises.length;
  const beatRate = betaBinomialBeatRate(beats, n);

  const predictive =
    signed.length >= 2
      ? predictiveChanceAbove(signed, 0, SURPRISE_PRIOR)
      : null;

  const consensus = input.consensus;
  const scale = consensus != null ? epsScale(consensus) : MIN_EPS_SCALE;
  const expectedSurprise = predictive?.mean ?? shrinkMean(mean(signed), n, SURPRISE_PRIOR, SURPRISE_PRIOR_STRENGTH);
  const revision = input.revision30d ?? 0;
  const ourEstimate =
    consensus != null
      ? consensus + expectedSurprise * scale + 0.25 * revision
      : null;

  const tBeat = predictive?.chance ?? null;
  const hitChance = tBeat ?? beatRate;

  let rangeHitChance: number | null = null;
  if (
    predictive &&
    consensus != null &&
    input.low != null &&
    input.high != null &&
    input.high > input.low
  ) {
    const mu = consensus + predictive.mean * scale;
    const se = predictive.scale * scale;
    const df = predictive.df;
    const lowT = (input.low - mu) / se;
    const highT = (input.high - mu) / se;
    rangeHitChance = clamp(
      studentTCdf(highT, df) - studentTCdf(lowT, df),
      0.02,
      0.98
    );
  }

  const dispersion =
    consensus != null &&
    input.low != null &&
    input.high != null &&
    Math.abs(consensus) > 0
      ? (input.high - input.low) / Math.abs(consensus)
      : null;

  const beatMoves = input.printMoves
    .filter((row) => row.surprisePercent >= 0)
    .map((row) => row.nextDayReturn);
  const missMoves = input.printMoves
    .filter((row) => row.surprisePercent < 0)
    .map((row) => row.nextDayReturn);
  const allMoves = input.printMoves.map((row) => Math.abs(row.nextDayReturn));
  const expectedMove =
    allMoves.length > 0
      ? mean(allMoves)
      : input.atrPercent != null
        ? input.atrPercent * 1.6
        : null;
  const avgBeatMove = beatMoves.length > 0 ? mean(beatMoves) : null;
  const avgMissMove = missMoves.length > 0 ? mean(missMoves) : null;

  const confidence = confidenceFromSample(n, dispersion, tBeat, beatRate);
  const trade = earningsStance({
    hitChance,
    confidence,
    qualityGrade: input.qualityGrade,
    avgBeatMove,
    avgMissMove,
    expectedMove,
  });

  const steps: string[] = [];
  steps.push(
    n > 0
      ? `Last ${n} prints: ${beats} beats vs consensus (${pct(beats / Math.max(n, 1))} raw).`
      : "No usable EPS surprise history on this snapshot."
  );
  steps.push(
    `Bayesian beat rate with a ${pct(EPS_BEAT_PRIOR)} market prior (${PRIOR_STRENGTH} pseudo-prints): ${pct(beatRate)}.`
  );
  if (predictive) {
    steps.push(
      `Student-t predictive on signed surprise (df ${predictive.df}, shrunk mean ${pct(predictive.mean, 1)}, scale ${pct(predictive.scale, 1)}): P(actual ≥ consensus) = ${pct(predictive.chance)}.`
    );
  } else {
    steps.push("Fewer than two surprises, so the t-model is skipped and the Bayesian beat rate is used.");
  }
  if (dispersion != null) {
    steps.push(
      `Analyst range width is ${pct(dispersion)} of consensus${rangeHitChance != null ? `; P(print lands inside the range) = ${pct(rangeHitChance)}` : ""}.`
    );
  }
  if (input.analystCount) {
    steps.push(`${input.analystCount} analysts on the EPS estimate.`);
  }
  if (revision !== 0 && consensus != null) {
    steps.push(
      `30-day revision ${revision >= 0 ? "+" : ""}${revision.toFixed(2)} EPS; a quarter of that is folded into our number, not into the beat probability.`
    );
  }
  if (expectedMove != null) {
    steps.push(
      `Typical |print-day| move ${pct(expectedMove, 1)}${avgBeatMove != null ? `; avg beat session ${pct(avgBeatMove, 1)}` : ""}${avgMissMove != null ? `; avg miss session ${pct(avgMissMove, 1)}` : ""}.`
    );
  }
  steps.push(`Hit chance shown is ${pct(hitChance)} (${tBeat != null ? "t-model" : "Bayesian beat rate"}).`);

  const history: EarningsSurprise[] = surprises.map((row) => {
    const surprise = signedSurprise(row.epsActual, row.epsEstimate);
    const move = input.printMoves.find(
      (item) => Math.abs(item.surprisePercent - surprise) < 1e-9
    );
    return {
      period: row.period,
      quarter: row.quarter,
      epsActual: row.epsActual,
      epsEstimate: row.epsEstimate,
      surprisePercent: surprise,
      nextDayReturn: move?.nextDayReturn ?? null,
    };
  });

  return {
    kind: "earnings",
    projected: {
      label: "EPS",
      consensus,
      low: input.low,
      high: input.high,
      ourEstimate,
      unit: "eps",
      revenueAvg: input.revenueAvg,
      revenueLow: input.revenueLow,
      revenueHigh: input.revenueHigh,
      yearAgoEps: input.yearAgoEps,
      analystCount: input.analystCount,
      quarterlyDividend: null,
      yield: null,
    },
    hitChance,
    missChance: 1 - hitChance,
    rangeHitChance,
    confidence,
    calculation: steps.join(" "),
    history,
    sampleSize: n,
    expectedMovePercent: expectedMove,
    avgBeatMovePercent: avgBeatMove,
    avgMissMovePercent: avgMissMove,
    trade,
    qualityGrade: input.qualityGrade,
  };
}

export function forecastDividend(input: DividendForecastInput): EventForecast {
  const annual =
    input.annualRate != null && input.annualRate > 0
      ? input.annualRate
      : input.trailingAnnual != null && input.trailingAnnual > 0
        ? input.trailingAnnual
        : null;
  const quarterly = annual != null ? annual / 4 : null;
  const payout = input.payoutRatio;

  let hit = input.declared ? 0.94 : 0.82;
  const steps: string[] = [];
  steps.push(
    input.declared
      ? "Ex-date is on the calendar, so the dividend is already declared — the usual case is that it pays."
      : "No declared ex-date in the snapshot; this is an estimated run-rate, not a board-approved check."
  );

  if (payout != null) {
    steps.push(`Payout ratio ${pct(payout)}.`);
    if (payout > 1) hit -= 0.28;
    else if (payout > 0.8) hit -= 0.14;
    else if (payout > 0.6) hit -= 0.06;
    else if (payout < 0.4) hit += 0.03;
  } else {
    steps.push("Payout ratio missing — coverage is not identified.");
    hit -= 0.08;
  }

  if (input.fcfPositive === false) {
    hit -= 0.16;
    steps.push("Free cash flow is negative, so the dividend is not self-funding on this snapshot.");
  } else if (input.fcfPositive) {
    hit += 0.03;
    steps.push("Free cash flow is positive.");
  }

  if (input.profitable === false) {
    hit -= 0.18;
    steps.push("The company is not profitable — dividends funded from the balance sheet do not last.");
  }

  hit = clamp(hit, 0.15, 0.98);
  steps.push(`Pay/maintain chance ${pct(hit)}.`);

  const stressed =
    (payout != null && payout > 0.85) ||
    input.fcfPositive === false ||
    input.profitable === false;
  const healthy =
    !stressed &&
    (payout == null || payout < 0.7) &&
    input.qualityGrade !== "Pass" &&
    input.qualityGrade !== "Speculative";

  let stance: EventTradeStance = "skip";
  let whenWindow: EventForecast["trade"]["whenWindow"] = "avoid";
  let when = "Do not buy the stock for the dividend";
  let summary =
    "The ex-date drop is usually about the dividend. Collecting it is not an edge unless you already wanted to own the business.";

  if (stressed) {
    stance = "skip";
    whenWindow = "before_event";
    when = "If you own it, consider selling before the ex-date";
    summary =
      "Coverage looks stretched. A cut, freeze, or a full ex-date drop on a weakening name is the risk — this is not a yield-chase.";
  } else if (healthy && input.qualityGrade === "Durable") {
    stance = "hold-through";
    whenWindow = "hold";
    when = "Hold through the ex-date if you already own it";
    summary = `A ${quarterly != null ? money(quarterly) : "regular"} dividend on a durable earner is a reason to keep a file, not a reason to open a new trade into the ex-date.`;
  }

  return {
    kind: "dividend",
    projected: {
      label: "Quarterly dividend",
      consensus: quarterly,
      low: quarterly,
      high: quarterly,
      ourEstimate: quarterly,
      unit: "usd",
      revenueAvg: null,
      revenueLow: null,
      revenueHigh: null,
      yearAgoEps: null,
      analystCount: null,
      quarterlyDividend: quarterly,
      yield: input.yield,
    },
    hitChance: hit,
    missChance: 1 - hit,
    rangeHitChance: null,
    confidence: input.declared && payout != null ? "High" : "Medium",
    calculation: steps.join(" "),
    history: [],
    sampleSize: 0,
    expectedMovePercent:
      input.yield != null ? -(input.yield / 4) : quarterly != null && annual != null
        ? null
        : null,
    avgBeatMovePercent: null,
    avgMissMovePercent: null,
    trade: {
      stance,
      direction: "none",
      whenWindow,
      when,
      summary,
    },
    qualityGrade: input.qualityGrade,
  };
}
