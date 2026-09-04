/**
 * Volatility surface slices and the VRP stance.
 *
 * Edge in options, when it exists, is a view that future realized vol will
 * differ from the vol the market has priced (IV). Theta is the rent for gamma,
 * not the edge. These helpers turn a chain into that language.
 */

import type {
  PreferredOptionStructure,
  TermShape,
  VolStance,
} from "./types";

export interface TermPoint {
  expiration: string;
  dte: number;
  atmIv: number;
}

export interface SkewSlice {
  atmIv: number;
  putIv: number | null;
  callIv: number | null;
  /** OTM put IV − OTM call IV. Equity smirk is usually positive. */
  riskReversal: number | null;
  putWingIv: number | null;
  callWingIv: number | null;
}

export interface VolStanceResult {
  stance: VolStance;
  preferredStructure: PreferredOptionStructure;
  ivRvRatio: number | null;
  vrp: number | null;
  reasons: string[];
  warnings: string[];
}

export function ivRvRatio(iv: number | null, rv: number | null): number | null {
  if (iv == null || rv == null || !(rv > 0) || !(iv > 0)) return null;
  return iv / rv;
}

export function varianceRiskPremium(
  iv: number | null,
  rv: number | null
): number | null {
  if (iv == null || rv == null) return null;
  return iv - rv;
}

export function classifyTermStructure(points: TermPoint[]): TermShape {
  const sorted = [...points]
    .filter((point) => point.dte > 0 && point.atmIv > 0)
    .sort((a, b) => a.dte - b.dte);
  if (sorted.length < 2) return "unknown";

  const near = sorted[0];
  const far =
    sorted.find((point) => point.dte >= 45) ?? sorted[sorted.length - 1];
  if (far.dte <= near.dte) return "unknown";

  const gap = far.atmIv - near.atmIv;
  if (Math.abs(gap) < 0.01) return "flat";
  return gap > 0 ? "contango" : "backwardation";
}

/**
 * Forward volatility between two expirations.
 * σ_fwd = sqrt((σ₂² T₂ − σ₁² T₁) / (T₂ − T₁))
 */
export function forwardVolatility(
  nearIv: number,
  nearYears: number,
  farIv: number,
  farYears: number
): number | null {
  if (
    !(nearIv > 0) ||
    !(farIv > 0) ||
    !(nearYears > 0) ||
    !(farYears > nearYears)
  ) {
    return null;
  }
  const nearVar = nearIv * nearIv * nearYears;
  const farVar = farIv * farIv * farYears;
  const denom = farYears - nearYears;
  if (farVar <= nearVar || denom <= 0) return null;
  return Math.sqrt((farVar - nearVar) / denom);
}

export function termSlopePerMonth(points: TermPoint[]): number | null {
  const sorted = [...points]
    .filter((point) => point.dte > 0 && point.atmIv > 0)
    .sort((a, b) => a.dte - b.dte);
  if (sorted.length < 2) return null;
  const near = sorted[0];
  const far = sorted[sorted.length - 1];
  const months = (far.dte - near.dte) / 30;
  if (months < 0.2) return null;
  return (far.atmIv - near.atmIv) / months;
}

interface StanceInput {
  atmIv: number | null;
  rv30: number | null;
  term: TermShape;
  ivPercentile: number | null;
  atmSpreadPct: number | null;
  atmOpenInterest: number | null;
  earningsInWindow: boolean;
  hasDefinedRiskStrikes: boolean;
}

const SELL_RATIO = 1.15;
const BUY_RATIO = 0.85;
const WIDE_SPREAD = 0.12;
const MIN_OI = 100;

export function volStance(input: StanceInput): VolStanceResult {
  const ratio = ivRvRatio(input.atmIv, input.rv30);
  const vrp = varianceRiskPremium(input.atmIv, input.rv30);
  const reasons: string[] = [];
  const warnings: string[] = [];

  const illiquid =
    (input.atmSpreadPct != null && input.atmSpreadPct > WIDE_SPREAD) ||
    (input.atmOpenInterest != null && input.atmOpenInterest < MIN_OI);

  if (illiquid) {
    warnings.push(
      "ATM bid–ask is wide or open interest is thin. Crossing that spread is a tax on any edge — wait or use a limit well inside the quote."
    );
  }

  if (input.earningsInWindow) {
    warnings.push(
      "An earnings print sits inside this expiration. That is event vol, not the everyday variance risk premium. A gap can blow through a short-gamma book; a crush can wreck a long premium purchase. Size as a binary, or stand aside."
    );
  }

  if (ratio == null) {
    reasons.push(
      "Not enough of a clean IV/RV read to take a vol view. No-trade zone."
    );
    return {
      stance: "wait",
      preferredStructure: "none",
      ivRvRatio: ratio,
      vrp,
      reasons,
      warnings,
    };
  }

  if (illiquid) {
    reasons.push(
      `IV/RV is ${ratio.toFixed(2)}, but this chain is not liquid enough to express it cleanly.`
    );
    return {
      stance: "wait",
      preferredStructure: "none",
      ivRvRatio: ratio,
      vrp,
      reasons,
      warnings,
    };
  }

  if (input.earningsInWindow && ratio >= SELL_RATIO) {
    reasons.push(
      `IV is rich versus 30-day realized (${ratio.toFixed(2)}×), but the richness is likely the print. Selling that vol is selling the gap, not harvesting VRP.`
    );
    return {
      stance: "wait",
      preferredStructure: "none",
      ivRvRatio: ratio,
      vrp,
      reasons,
      warnings,
    };
  }

  if (ratio >= SELL_RATIO && input.term === "backwardation") {
    reasons.push(
      `IV/RV is ${ratio.toFixed(2)} but the term structure is inverted. That is usually acute fear or a known event, not a quiet overpriced insurance book.`
    );
    warnings.push(
      "Backwardation often reverts, but the path is a vol spike. Short vol here is a different trade than selling sticky IV in contango."
    );
    return {
      stance: "wait",
      preferredStructure: "none",
      ivRvRatio: ratio,
      vrp,
      reasons,
      warnings,
    };
  }

  if (ratio >= SELL_RATIO) {
    reasons.push(
      `ATM IV is ${ratio.toFixed(2)}× 30-day realized. The market is charging more for future movement than this name has recently delivered.`
    );
    if (input.term === "contango") {
      reasons.push(
        "Term structure is in contango (longer-dated IV above near-dated). That is the usual backdrop for harvesting variance risk premium."
      );
    }
    if (input.ivPercentile != null && input.ivPercentile < 0.4) {
      reasons.push(
        "IV sits in the lower half of this name's 2-year realized-vol distribution — not a panic print. Short-vol screens often do better here than at IV extremes."
      );
    }
    if (input.ivPercentile != null && input.ivPercentile > 0.85) {
      warnings.push(
        "IV is high versus this name's own RV history. Rich vs recent RV can still be fair if a new regime has started."
      );
    }
    reasons.push(
      "Theta is not the edge. You get paid theta because you are short gamma. The bet is that subsequent RV comes in below the IV you sold."
    );

    const preferred: PreferredOptionStructure = input.hasDefinedRiskStrikes
      ? "iron_condor"
      : "put_credit_spread";
    reasons.push(
      preferred === "iron_condor"
        ? "Express it with a defined-risk iron condor, not a naked straddle. Wings cap gap risk and usually consume far less margin."
        : "Not enough clean strikes for a condor — a put credit spread is the defined-risk substitute."
    );

    return {
      stance: "sell_vol",
      preferredStructure: preferred,
      ivRvRatio: ratio,
      vrp,
      reasons,
      warnings,
    };
  }

  if (ratio <= BUY_RATIO) {
    reasons.push(
      `ATM IV is only ${ratio.toFixed(2)}× 30-day realized. Options look cheap relative to the movement this name has actually been putting up.`
    );
    reasons.push(
      "Long options: you pay theta for positive gamma. The move (or an IV expansion) has to more than cover that rent."
    );
    if (input.term === "backwardation") {
      reasons.push(
        "Near-dated IV is elevated versus the back — if that is a known event already passed, the cheapness may be further out."
      );
    }
    return {
      stance: "buy_vol",
      preferredStructure: "long_straddle",
      ivRvRatio: ratio,
      vrp,
      reasons,
      warnings,
    };
  }

  reasons.push(
    `IV/RV is ${ratio.toFixed(2)} — inside the no-trade band (0.85–1.15). The market's vol forecast is close to what has been realized; costs would likely eat any residual.`
  );
  return {
    stance: "wait",
    preferredStructure: "none",
    ivRvRatio: ratio,
    vrp,
    reasons,
    warnings,
  };
}

export function nearestBy<T>(
  items: T[],
  target: number,
  value: (item: T) => number | null
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const item of items) {
    const current = value(item);
    if (current == null || !Number.isFinite(current)) continue;
    const dist = Math.abs(current - target);
    if (dist < bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  return best;
}
