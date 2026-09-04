/**
 * Click-to-build helpers for a custom option structure.
 *
 * Premiums stay conservative: ask to buy, bid to sell. The "fill IV" is a
 * vega-weighted average of the legs you actually clicked — not a mid inversion
 * that pretends you got filled inside the spread.
 */

import {
  EQUITY_MULTIPLIER,
  expirationStats,
  type StructureLeg,
} from "./options-structures";
import type {
  OptionContract,
  OptionRight,
  OptionStructureView,
  VolStance,
} from "./types";

export interface DraftLeg {
  type: OptionRight;
  strike: number;
  side: "long" | "short";
}

export function contractKey(type: OptionRight, strike: number): string {
  return `${type}:${strike}`;
}

export function premiumFor(
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

export function toggleDraftLeg(
  current: DraftLeg[],
  next: DraftLeg
): DraftLeg[] {
  const index = current.findIndex(
    (leg) => leg.type === next.type && leg.strike === next.strike
  );
  if (index === -1) return [...current, next];
  const existing = current[index];
  if (existing.side === next.side) {
    return current.filter((_, i) => i !== index);
  }
  return current.map((leg, i) => (i === index ? next : leg));
}

export function draftToLegs(
  draft: DraftLeg[],
  lookup: (type: OptionRight, strike: number) => OptionContract | null
): StructureLeg[] | null {
  const legs: StructureLeg[] = [];
  for (const item of draft) {
    const contract = lookup(item.type, item.strike);
    const premium = premiumFor(contract, item.side);
    if (premium == null) return null;
    legs.push({
      type: item.type,
      side: item.side,
      strike: item.strike,
      premium,
      quantity: 1,
      iv: contract?.iv ?? null,
    });
  }
  return legs;
}

export function vegaWeightedIv(
  legs: StructureLeg[],
  lookup: (type: OptionRight, strike: number) => OptionContract | null
): number | null {
  let weight = 0;
  let acc = 0;
  for (const leg of legs) {
    const contract = lookup(leg.type, leg.strike);
    const iv = leg.iv ?? contract?.iv ?? null;
    const vega = contract?.vega ?? null;
    if (iv == null || vega == null || !(Math.abs(vega) > 0)) continue;
    const w = Math.abs(vega) * leg.quantity;
    acc += w * iv;
    weight += w;
  }
  if (!(weight > 0)) return null;
  return acc / weight;
}

export function netGreeksFromContracts(
  legs: StructureLeg[],
  lookup: (type: OptionRight, strike: number) => OptionContract | null
): {
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
} {
  let delta = 0;
  let gamma = 0;
  let theta = 0;
  let vega = 0;
  let missing = false;
  for (const leg of legs) {
    const contract = lookup(leg.type, leg.strike);
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

export type StanceMatch = "match" | "conflict" | "neutral";

export function structureMatchesStance(
  stance: VolStance,
  netVega: number | null,
  definedRisk: boolean
): StanceMatch {
  if (netVega == null || stance === "wait") return "neutral";
  if (stance === "sell_vol") {
    if (netVega < 0 && definedRisk) return "match";
    if (netVega > 0) return "conflict";
    return "neutral";
  }
  if (stance === "buy_vol" || stance === "event_vol") {
    if (netVega > 0) return "match";
    if (netVega < 0) return "conflict";
    return "neutral";
  }
  return "neutral";
}

export function customStructureView(
  draft: DraftLeg[],
  lookup: (type: OptionRight, strike: number) => OptionContract | null,
  stance: VolStance
): OptionStructureView | null {
  if (draft.length === 0) return null;
  const legs = draftToLegs(draft, lookup);
  if (!legs || legs.some((leg) => !(leg.premium > 0))) return null;

  const stats = expirationStats(legs);
  const greeks = netGreeksFromContracts(legs, lookup);
  const fillIv = vegaWeightedIv(legs, lookup);
  const match = structureMatchesStance(stance, greeks.vega, stats.definedRisk);

  const thesisBits = [
    "Custom structure from the chain. Premiums use ask to buy and bid to sell.",
    fillIv != null
      ? `Vega-weighted fill IV ${((fillIv as number) * 100).toFixed(1)}%.`
      : null,
    match === "match"
      ? "Net vega lines up with the vol stance."
      : match === "conflict"
        ? "Net vega fights the vol stance — this is a different trade than the desk recommended."
        : null,
    !stats.definedRisk
      ? "Undefined risk. A gap through the short strike is not capped."
      : null,
  ].filter((row): row is string => row != null);

  return {
    id: "custom",
    name: "Custom structure",
    thesis: thesisBits.join(" "),
    debitCredit: stats.debitCredit,
    netPremium: stats.netPremium,
    multiplier: EQUITY_MULTIPLIER,
    maxProfit: stats.maxProfit,
    maxLoss: stats.maxLoss,
    breakevens: stats.breakevens,
    capitalAtRisk: stats.capitalAtRisk,
    definedRisk: stats.definedRisk,
    recommended: match === "match",
    legs: legs.map((leg) => {
      const contract = lookup(leg.type, leg.strike);
      return {
        type: leg.type,
        side: leg.side,
        strike: leg.strike,
        premium: leg.premium,
        delta: contract?.delta ?? null,
        iv: leg.iv ?? contract?.iv ?? null,
      };
    }),
    payoff: stats.payoff,
    netDelta: greeks.delta,
    netGamma: greeks.gamma,
    netTheta: greeks.theta,
    netVega: greeks.vega,
  };
}
