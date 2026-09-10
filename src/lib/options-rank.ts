/**
 * Rank option structures as vol expressions, not lottery tickets.
 *
 * Chance of profit is expiration P&L > 0 under a lognormal with ATM IV —
 * that is the chance the chain itself implies, not an edge. Expected P&L
 * uses 30-day realized vol as the forecast: that is the IV/RV thesis.
 * Directional overlays (covered call, long stock substitutes) stay out of
 * the pick list because their stock P&L is not in the option payoff.
 */

import { normPdf } from "./black-scholes";
import { structureMatchesStance, type StanceMatch } from "./options-builder";
import { expirationPnl, type StructureLeg } from "./options-structures";
import {
  robinhoodHowTo,
  ticketFitsLevel,
  type RobinhoodLevel,
} from "./robinhood-options";
import type {
  OptionStructureId,
  OptionStructureView,
  OptionsScanRow,
  VolStance,
} from "./types";

const SKIP_PICKS = new Set<OptionStructureId>([
  "covered_call",
  "long_call",
  "long_put",
  "put_debit_spread",
]);

export interface RankEnv {
  spot: number;
  timeYears: number;
  rate: number;
  dividendYield: number;
  atmIv: number | null;
  rv30: number | null;
  stance: VolStance;
}

export interface ExpirationIntegral {
  pop: number;
  expectedPnl: number;
  /** E[P&L | P&L > 0] — the typical win, not the max. */
  typicalWin: number | null;
  /** E[P&L | P&L <= 0] — the typical miss, not the max loss. */
  typicalLoss: number | null;
}

export interface RankedStructure {
  structure: OptionStructureView;
  pop: number | null;
  forecastPop: number | null;
  expectedPnl: number | null;
  expectedReturn: number | null;
  typicalWin: number | null;
  typicalLoss: number | null;
  pricedPnl: number | null;
  rewardRisk: number | null;
  align: StanceMatch;
  score: number;
}

export interface StructurePicks {
  best: RankedStructure | null;
  highestChance: RankedStructure | null;
  highestReturn: RankedStructure | null;
  note: string;
}

export type BeginnerAction = "stand_aside" | "consider";

export interface BeginnerRecommendation {
  action: BeginnerAction;
  ranked: RankedStructure | null;
  headline: string;
  why: string;
  howYouLose: string;
  trap: string;
}

export function viewToLegs(structure: OptionStructureView): StructureLeg[] {
  return structure.legs.map((leg) => ({
    type: leg.type,
    side: leg.side,
    strike: leg.strike,
    premium: leg.premium,
    quantity: 1,
    iv: leg.iv,
  }));
}

function lognormalParams(
  spot: number,
  sigma: number,
  timeYears: number,
  mu: number
): { meanLog: number; sdLog: number } | null {
  if (!(spot > 0) || !(sigma > 0) || !(timeYears > 0)) return null;
  const sdLog = sigma * Math.sqrt(timeYears);
  if (!(sdLog > 0)) return null;
  return {
    meanLog: Math.log(spot) + (mu - 0.5 * sigma * sigma) * timeYears,
    sdLog,
  };
}

function lognormalPdf(x: number, meanLog: number, sdLog: number): number {
  if (!(x > 0)) return 0;
  const z = (Math.log(x) - meanLog) / sdLog;
  return normPdf(z) / (x * sdLog);
}

function priceGrid(spot: number, steps = 161): number[] {
  const lo = spot * 0.35;
  const hi = spot * 2.5;
  const points: number[] = [];
  for (let i = 0; i < steps; i++) {
    points.push(lo + (i / (steps - 1)) * (hi - lo));
  }
  return points;
}

export function integrateExpiration(
  legs: StructureLeg[],
  spot: number,
  sigma: number,
  timeYears: number,
  mu: number
): ExpirationIntegral | null {
  const params = lognormalParams(spot, sigma, timeYears, mu);
  if (!params || legs.length === 0) return null;

  const prices = priceGrid(spot);
  let mass = 0;
  let winMass = 0;
  let loseMass = 0;
  let expected = 0;
  let winPnl = 0;
  let losePnl = 0;
  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    const width =
      i === 0
        ? prices[1] - prices[0]
        : i === prices.length - 1
          ? prices[i] - prices[i - 1]
          : 0.5 * (prices[i + 1] - prices[i - 1]);
    const density = lognormalPdf(price, params.meanLog, params.sdLog);
    const w = density * width;
    const pnl = expirationPnl(price, legs);
    mass += w;
    expected += w * pnl;
    if (pnl > 0) {
      winMass += w;
      winPnl += w * pnl;
    } else {
      loseMass += w;
      losePnl += w * pnl;
    }
  }
  if (!(mass > 0)) return null;
  return {
    pop: winMass / mass,
    expectedPnl: expected / mass,
    typicalWin: winMass > 0 ? winPnl / winMass : null,
    typicalLoss: loseMass > 0 ? losePnl / loseMass : null,
  };
}

function capital(structure: OptionStructureView): number | null {
  if (structure.capitalAtRisk != null && structure.capitalAtRisk > 0) {
    return structure.capitalAtRisk;
  }
  if (structure.debitCredit === "debit" && structure.netPremium > 0) {
    return structure.netPremium * structure.multiplier;
  }
  return null;
}

const THIN_EDGE = 0.05;

export function rankStructure(
  structure: OptionStructureView,
  env: RankEnv
): RankedStructure {
  const legs = viewToLegs(structure);
  const mu = env.rate - env.dividendYield;
  const priced =
    env.atmIv != null
      ? integrateExpiration(legs, env.spot, env.atmIv, env.timeYears, mu)
      : null;
  const forecast =
    env.stance === "event_vol" ? env.atmIv : (env.rv30 ?? env.atmIv);
  const forecasted =
    forecast != null
      ? integrateExpiration(legs, env.spot, forecast, env.timeYears, mu)
      : null;
  const pop = priced?.pop ?? null;
  const pricedPnl = priced?.expectedPnl ?? null;
  const expectedPnl = forecasted?.expectedPnl ?? null;
  const cap = capital(structure);
  const expectedReturn =
    expectedPnl != null && cap != null && cap > 0 ? expectedPnl / cap : null;
  const rewardRisk =
    structure.maxProfit != null &&
    structure.maxLoss != null &&
    structure.maxLoss < 0
      ? structure.maxProfit / Math.abs(structure.maxLoss)
      : null;
  const align = structureMatchesStance(
    env.stance,
    structure.netVega,
    structure.definedRisk
  );

  let score = 0;
  if (align === "match") score += 2;
  else if (align === "conflict") score -= 5;
  if (structure.definedRisk) score += 0.8;
  if (pop != null) score += pop;
  if (expectedReturn != null) {
    score += Math.max(-1, Math.min(2, expectedReturn));
  }
  if (SKIP_PICKS.has(structure.id)) score -= 3;

  return {
    structure,
    pop,
    forecastPop: forecasted?.pop ?? null,
    expectedPnl,
    expectedReturn,
    typicalWin: forecasted?.typicalWin ?? null,
    typicalLoss: forecasted?.typicalLoss ?? null,
    pricedPnl,
    rewardRisk,
    align,
    score,
  };
}

export function rankStructures(
  structures: OptionStructureView[],
  env: RankEnv
): RankedStructure[] {
  return structures.map((structure) => rankStructure(structure, env));
}

function eligible(
  ranked: RankedStructure,
  level: RobinhoodLevel
): boolean {
  if (ranked.align === "conflict") return false;
  if (ranked.structure.id === "custom") {
    return ranked.structure.definedRisk && level === 3;
  }
  if (SKIP_PICKS.has(ranked.structure.id)) return false;
  if (ranked.structure.id === "cash_secured_put" && level === 3) return false;
  return ticketFitsLevel(ranked.structure.id, level);
}

export function selectPicks(
  ranked: RankedStructure[],
  stance: VolStance,
  level: RobinhoodLevel = 3
): StructurePicks {
  const pool = ranked.filter((row) => eligible(row, level));
  const aligned = pool.filter((row) =>
    stance === "wait" ? true : row.align === "match"
  );
  const forChance = (aligned.length > 0 ? aligned : pool).filter(
    (row) => row.pop != null
  );
  const forReturn = (aligned.length > 0 ? aligned : pool).filter(
    (row) => row.expectedReturn != null || row.rewardRisk != null
  );

  const highestChance =
    [...forChance].sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0))[0] ?? null;

  const returnKey = (row: RankedStructure) =>
    row.expectedReturn ?? (row.rewardRisk ?? -Infinity) * 0.2;
  const highestReturn =
    [...forReturn].sort((a, b) => returnKey(b) - returnKey(a))[0] ?? null;

  const bestPool = aligned.length > 0 ? aligned : pool;
  const best =
    stance === "wait"
      ? null
      : [...bestPool].sort((a, b) => b.score - a.score)[0] ?? null;

  const note =
    stance === "wait"
      ? "No vol edge in the 0.85–1.15 IV/RV band. Chance and return below are the chain's own math, not a go signal."
      : stance === "event_vol"
        ? "Chance of profit uses the print IV. That is the implied-move hurdle, not everyday VRP. Highest return assumes realized vol looks like that IV — a long straddle only pays if the gap is larger."
        : "Chance of profit is priced off ATM IV (what the chain implies). Expected return assumes subsequent realized vol looks like the last 30 days — that is the IV/RV bet, not a directional call. Only Robinhood tickets at your selected level are listed.";

  return { best, highestChance, highestReturn, note };
}

function beginnerEligible(
  row: RankedStructure,
  level: RobinhoodLevel
): boolean {
  if (row.structure.id === "custom") return false;
  if (!ticketFitsLevel(row.structure.id, level)) return false;
  if (level === 2) {
    if (row.structure.id !== "cash_secured_put") return false;
    if (row.expectedPnl == null || !(row.expectedPnl > 0)) return false;
    return true;
  }
  if (SKIP_PICKS.has(row.structure.id)) return false;
  if (!row.structure.definedRisk) return false;
  if (row.align !== "match") return false;
  if (row.expectedPnl == null || !(row.expectedPnl > 0)) return false;
  if (row.expectedReturn != null && row.expectedReturn < THIN_EDGE) return false;
  return true;
}

function expectedValueKey(row: RankedStructure): number {
  return row.expectedPnl ?? -Infinity;
}

function missPain(row: RankedStructure): number {
  if (row.typicalLoss == null) return Infinity;
  return Math.abs(row.typicalLoss);
}

export const BEGINNER_TRAP =
  "A high chance of a small win is not safer. Short-premium trades often show a 60–80% win rate because the credit is tiny; the rare miss is the large number. Ranking by win rate × max profit picks those. This desk uses the average of wins and losses instead — chance of profit times typical win, plus chance of loss times typical miss.";

export function recommendForBeginner(
  ranked: RankedStructure[],
  stance: VolStance,
  level: RobinhoodLevel = 3
): BeginnerRecommendation {
  if (stance === "wait") {
    return {
      action: "stand_aside",
      ranked: null,
      headline: "Sit this one out.",
      why: "Implied vol and recent realized vol are close. The chain is not obviously cheap or expensive, so there is no vol lesson here — only a coin flip after the bid–ask.",
      howYouLose: "Any structure you open is paying the spread for a view the desk does not have.",
      trap: BEGINNER_TRAP,
    };
  }

  if (stance === "event_vol") {
    return {
      action: "stand_aside",
      ranked: null,
      headline: "Do not start with an earnings lottery.",
      why: "A print inside this expiry is event vol. The straddle already prices a move. This desk cannot know whether the gap will be larger than that implied move — that is a guess, not a calculation. On Robinhood a long straddle is Level 3, margin only.",
      howYouLose: "If the stock gaps less than the implied move, a long straddle decays. If you sell the move, one surprise print can take the max loss. Robinhood will not take a naked short through the print.",
      trap: BEGINNER_TRAP,
    };
  }

  if (level === 2 && stance === "buy_vol") {
    return {
      action: "stand_aside",
      ranked: null,
      headline: "Level 2 cannot place this vol view.",
      why: "Robinhood Level 2 tickets are Long call, Long put, Covered call, and Cash-secured put. A Long straddle is Level 3 (margin account). Buying a call here would be a stock bet, not the IV/RV trade.",
      howYouLose: "Apply for Level 3 if you want Trade → Trade options → Strategy builder → Long straddle. Do not force a long call because options look cheap.",
      trap: BEGINNER_TRAP,
    };
  }

  const pool = ranked.filter((row) => beginnerEligible(row, level));
  const choice =
    [...pool].sort((a, b) => {
      const ev = expectedValueKey(b) - expectedValueKey(a);
      if (Math.abs(ev) > 1e-6) return ev;
      return missPain(a) - missPain(b);
    })[0] ?? null;

  if (!choice) {
    const view =
      stance === "buy_vol"
        ? "Options look cheap versus recent movement, but after the ask-to-buy / bid-to-sell spread none of the defined-risk structures have a thick enough average leftover."
        : "Options look expensive versus recent movement, but after the spread none of the defined-risk short-vol structures have a thick enough average leftover.";
    return {
      action: "stand_aside",
      ranked: null,
      headline: "No clean first trade on this chain.",
      why: view,
      howYouLose: "Forcing a long call or a naked short is either the wrong bet or a ticket Robinhood will reject. Credit spreads and iron condors are Level 3.",
      trap: BEGINNER_TRAP,
    };
  }

  const howYouLose =
    stance === "buy_vol"
      ? "You lose when the stock stays quieter than the last 30 days, or IV does not expand — you paid theta for a move that did not arrive."
      : "You lose when the stock moves more than the last 30 days. The credit is the typical win; the miss is the wide part of the payoff.";

  return {
    action: "consider",
    ranked: choice,
    headline: `If you express the vol view, use the ${choice.structure.name}.`,
    why: `On Robinhood: ${robinhoodHowTo(choice.structure.id) ?? choice.structure.name}. That is the defined-risk ticket whose average expiration P&L is highest once each outcome is weighted by how likely it is. Chance of profit is what the chain prices (ATM IV). The average uses the last 30 days of realized vol. Limit order — Robinhood will not take an uncovered short.`,
    howYouLose: `${howYouLose} Max loss is ${choice.structure.maxLoss == null ? "not capped" : "capped"}; this is still a probability-weighted average, not a promise.`,
    trap: BEGINNER_TRAP,
  };
}

/** Larger |IV/RV − 1| is a cleaner vol screen, once the stance is actionable. */
export function scanEdge(row: OptionsScanRow): number {
  if (row.skipped || row.ivRvRatio == null || !(row.ivRvRatio > 0)) return -1;
  if (row.stance === "wait") return 0;
  const distance = Math.abs(Math.log(row.ivRvRatio));
  if (row.stance === "event_vol") return distance * 0.5;
  return distance;
}

export function sortScanRows(rows: OptionsScanRow[]): OptionsScanRow[] {
  return [...rows].sort((a, b) => {
    const edge = scanEdge(b) - scanEdge(a);
    if (Math.abs(edge) > 1e-9) return edge;
    return a.symbol.localeCompare(b.symbol);
  });
}
