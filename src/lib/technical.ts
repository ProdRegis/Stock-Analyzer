import type {
  BreakoutSignal,
  MovingAverages,
  PastBreakout,
  PastDipRecovery,
  PricePoint,
  ResistanceLevel,
  StopLossReasonDetail,
} from "./types";

export function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / period;
}

export function computeMovingAverages(prices: number[]): MovingAverages {
  return {
    sma20: sma(prices, 20),
    sma50: sma(prices, 50),
    sma200: sma(prices, 200),
  };
}

function findLocalExtrema(
  history: PricePoint[],
  type: "high" | "low",
  lookback = 5
): number[] {
  const levels: number[] = [];

  for (let i = lookback; i < history.length - lookback; i++) {
    const value = type === "high" ? history[i].high : history[i].low;
    let isExtremum = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      const compare = type === "high" ? history[j].high : history[j].low;
      if (type === "high" ? compare >= value : compare <= value) {
        isExtremum = false;
        break;
      }
    }

    if (isExtremum) levels.push(value);
  }

  return levels;
}

function clusterLevels(
  levels: number[],
  tolerance = 0.02
): ResistanceLevel[] {
  if (levels.length === 0) return [];

  const sorted = [...levels].sort((a, b) => a - b);
  const clusters: { prices: number[] }[] = [];

  for (const level of sorted) {
    const cluster = clusters.find((item) => {
      const avg = item.prices.reduce((sum, p) => sum + p, 0) / item.prices.length;
      return Math.abs(level - avg) / avg <= tolerance;
    });

    if (cluster) {
      cluster.prices.push(level);
    } else {
      clusters.push({ prices: [level] });
    }
  }

  return clusters
    .map((cluster) => {
      const price =
        cluster.prices.reduce((sum, p) => sum + p, 0) / cluster.prices.length;
      return {
        price: Math.round(price * 100) / 100,
        strength: Math.min(100, cluster.prices.length * 25),
        touches: cluster.prices.length,
        label: `$${price.toFixed(2)}`,
      };
    })
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);
}

export function findResistanceLevels(history: PricePoint[]): ResistanceLevel[] {
  const recent = history.slice(-120);
  return clusterLevels(findLocalExtrema(recent, "high"));
}

export function findSupportLevels(history: PricePoint[]): ResistanceLevel[] {
  const recent = history.slice(-120);
  return clusterLevels(findLocalExtrema(recent, "low"));
}

export function detectBreakout(
  history: PricePoint[],
  resistanceLevels: ResistanceLevel[],
  supportLevels: ResistanceLevel[]
): BreakoutSignal {
  if (history.length < 20) {
    return {
      level: 0,
      type: "none",
      description: "Insufficient data for breakout analysis",
      confidence: 0,
    };
  }

  const current = history[history.length - 1];
  const avgVolume =
    history.slice(-20).reduce((sum, point) => sum + point.volume, 0) / 20;
  const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : 1;

  const nearestResistance = resistanceLevels
    .filter((level) => level.price >= current.close * 0.98)
    .sort((a, b) => a.price - b.price)[0];

  const nearestSupport = supportLevels
    .filter((level) => level.price <= current.close * 1.02)
    .sort((a, b) => b.price - a.price)[0];

  if (
    nearestResistance &&
    current.close > nearestResistance.price &&
    current.high > nearestResistance.price
  ) {
    const confidence = Math.min(
      95,
      Math.round(
        50 +
          nearestResistance.strength * 0.3 +
          (volumeRatio > 1.5 ? 20 : volumeRatio > 1.2 ? 10 : 0)
      )
    );
    return {
      level: nearestResistance.price,
      type: "bullish",
      description: `Price broke above resistance at $${nearestResistance.price.toFixed(2)}${volumeRatio > 1.3 ? " with elevated volume" : ""}`,
      confidence,
    };
  }

  if (
    nearestSupport &&
    current.close < nearestSupport.price &&
    current.low < nearestSupport.price
  ) {
    const confidence = Math.min(
      95,
      Math.round(
        50 +
          nearestSupport.strength * 0.3 +
          (volumeRatio > 1.5 ? 20 : volumeRatio > 1.2 ? 10 : 0)
      )
    );
    return {
      level: nearestSupport.price,
      type: "bearish",
      description: `Price broke below support at $${nearestSupport.price.toFixed(2)}`,
      confidence,
    };
  }

  if (nearestResistance) {
    const distance =
      ((nearestResistance.price - current.close) / current.close) * 100;
    if (distance < 3) {
      return {
        level: nearestResistance.price,
        type: "none",
        description: `Approaching resistance at $${nearestResistance.price.toFixed(2)} (${distance.toFixed(1)}% away) — watch for potential breakout`,
        confidence: Math.round(40 + nearestResistance.strength * 0.2),
      };
    }
  }

  return {
    level: nearestResistance?.price ?? 0,
    type: "none",
    description: "No active breakout signal detected",
    confidence: 0,
  };
}

export function enrichHistoryWithMAs(history: PricePoint[]) {
  const closes = history.map((point) => point.close);

  return history.map((point, index) => {
    const slice = closes.slice(0, index + 1);
    return {
      ...point,
      sma20: sma(slice, 20),
      sma50: sma(slice, 50),
      sma200: sma(slice, 200),
    };
  });
}

export function findHistoricalBreakouts(history: PricePoint[]): PastBreakout[] {
  const breakouts: PastBreakout[] = [];
  const seen = new Set<string>();

  for (let i = 60; i < history.length - 10; i++) {
    const window = history.slice(i - 60, i);
    const resistanceLevels = findResistanceLevels(window);
    const previous = history[i - 1];
    const current = history[i];

    for (const level of resistanceLevels) {
      const crossed =
        previous.close <= level.price &&
        current.close > level.price &&
        current.high > level.price;

      if (!crossed) continue;

      const key = `${current.date}-${level.price.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const avgVolume =
        window.slice(-20).reduce((sum, point) => sum + point.volume, 0) / 20;
      const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : 1;
      const price5d = history[i + 5]?.close ?? current.close;
      const price10d = history[i + 10]?.close ?? current.close;
      const followThrough5d = (price5d - current.close) / current.close;
      const followThrough10d = (price10d - current.close) / current.close;

      breakouts.push({
        date: current.date,
        resistanceLevel: level.price,
        breakoutPrice: current.close,
        volumeRatio,
        followThrough5d,
        followThrough10d,
        successful: followThrough10d > 0.02,
      });
    }
  }

  return breakouts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function scoreBreakoutLikelihood(
  history: PricePoint[],
  resistanceLevels: ResistanceLevel[],
  pastBreakouts: PastBreakout[]
): {
  score: number;
  nearestResistance: ResistanceLevel | null;
  distanceToResistance: number;
  historicalSuccessRate: number;
} {
  if (history.length < 30) {
    return {
      score: 0,
      nearestResistance: null,
      distanceToResistance: 100,
      historicalSuccessRate: 0,
    };
  }

  const current = history[history.length - 1];
  const nearestResistance =
    resistanceLevels
      .filter((level) => level.price >= current.close * 0.92)
      .sort((a, b) => a.price - b.price)[0] ?? null;

  if (!nearestResistance) {
    return {
      score: 0,
      nearestResistance: null,
      distanceToResistance: 100,
      historicalSuccessRate: 0,
    };
  }

  const distanceToResistance =
    ((nearestResistance.price - current.close) / current.close) * 100;

  const historicalSuccessRate =
    pastBreakouts.length > 0
      ? pastBreakouts.filter((event) => event.successful).length /
        pastBreakouts.length
      : 0;

  const proximityScore =
    distanceToResistance <= 0
      ? 30
      : distanceToResistance <= 2
        ? 28
        : distanceToResistance <= 5
          ? 22
          : distanceToResistance <= 8
            ? 12
            : distanceToResistance <= 12
              ? 5
              : 0;

  const strengthScore = nearestResistance.strength * 0.22;
  const historyScore = historicalSuccessRate * 25;

  const similarBreakouts = pastBreakouts.filter(
    (event) =>
      Math.abs(event.resistanceLevel - nearestResistance.price) /
        nearestResistance.price <
      0.04
  );
  const similarSuccessRate =
    similarBreakouts.length > 0
      ? similarBreakouts.filter((event) => event.successful).length /
        similarBreakouts.length
      : historicalSuccessRate;
  const similarScore = similarSuccessRate * 18;

  const avgVolume =
    history.slice(-20).reduce((sum, point) => sum + point.volume, 0) / 20;
  const recentVolume =
    history.slice(-5).reduce((sum, point) => sum + point.volume, 0) / 5;
  const volumeScore =
    recentVolume > avgVolume * 1.3 ? 12 : recentVolume > avgVolume * 1.1 ? 7 : 0;

  const frequencyScore = Math.min(8, pastBreakouts.length);

  const score = Math.min(
    100,
    Math.round(
      proximityScore +
        strengthScore +
        historyScore +
        similarScore +
        volumeScore +
        frequencyScore
    )
  );

  return {
    score,
    nearestResistance,
    distanceToResistance,
    historicalSuccessRate,
  };
}

export function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }

  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  // A flat series has no gains and no losses; that is neutral, not overbought.
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function findHistoricalDipRecoveries(history: PricePoint[]): PastDipRecovery[] {
  const dips: PastDipRecovery[] = [];
  const seen = new Set<string>();

  for (let i = 30; i < history.length - 12; i++) {
    const window = history.slice(i - 20, i + 1);
    const closes = window.map((point) => point.close);
    const sma20 = sma(closes, 20);
    if (!sma20) continue;

    const current = history[i];
    const dipPercent = ((sma20 - current.close) / sma20) * 100;

    if (dipPercent < 5) continue;

    const key = current.date;
    if (seen.has(key)) continue;
    seen.add(key);

    const supportLevels = findSupportLevels(history.slice(0, i + 1));
    const nearestSupport =
      supportLevels
        .filter((level) => level.price <= current.close * 1.03)
        .sort((a, b) => b.price - a.price)[0]?.price ?? current.low;

    let recoveryDays = 10;
    let recoveredFully = false;

    for (let j = 1; j <= 15; j++) {
      const future = history[i + j];
      if (!future) break;
      if (future.close >= sma20 * 0.99) {
        recoveryDays = j;
        recoveredFully = true;
        break;
      }
    }

    const price10d = history[i + 10]?.close ?? current.close;
    const gain10d = (price10d - current.close) / current.close;

    dips.push({
      date: current.date,
      dipPercent,
      supportLevel: nearestSupport,
      recoveryDays,
      recoveredFully,
      gain10d,
    });
  }

  return dips.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function scoreLongDipOpportunity(
  history: PricePoint[],
  supportLevels: ResistanceLevel[],
  pastDips: PastDipRecovery[]
): {
  score: number;
  dipPercent: number;
  rsi: number;
  nearestSupport: ResistanceLevel | null;
  distanceToSupport: number;
  historicalRecoveryRate: number;
  avgRecoveryDays: number;
} {
  if (history.length < 30) {
    return {
      score: 0,
      dipPercent: 0,
      rsi: 50,
      nearestSupport: null,
      distanceToSupport: 100,
      historicalRecoveryRate: 0,
      avgRecoveryDays: 7,
    };
  }

  const closes = history.map((point) => point.close);
  const current = history[history.length - 1];
  const sma20 = sma(closes, 20) ?? current.close;
  const sma50 = sma(closes, 50) ?? current.close;

  const recentHigh = Math.max(...closes.slice(-20));
  const dipFromHigh = ((recentHigh - current.close) / recentHigh) * 100;
  const dipFromSma = ((sma20 - current.close) / sma20) * 100;
  const dipPercent = Math.max(dipFromHigh, dipFromSma, 0);

  const rsi = computeRSI(closes);

  const nearestSupport =
    supportLevels
      .filter((level) => level.price <= current.close * 1.04)
      .sort((a, b) => b.price - a.price)[0] ?? null;

  const distanceToSupport = nearestSupport
    ? ((current.close - nearestSupport.price) / current.close) * 100
    : 100;

  const recovered = pastDips.filter((dip) => dip.recoveredFully || dip.gain10d > 0.03);
  const historicalRecoveryRate =
    pastDips.length >= 3
      ? recovered.length / pastDips.length
      : pastDips.length > 0
        ? recovered.length / pastDips.length
        : 0.35;

  const avgRecoveryDays =
    pastDips.length > 0
      ? pastDips.reduce((sum, dip) => sum + dip.recoveryDays, 0) / pastDips.length
      : 5;

  const dipScore = Math.min(30, dipPercent * 2.5);
  const rsiScore = rsi <= 25 ? 25 : rsi <= 30 ? 20 : rsi <= 35 ? 12 : rsi <= 40 ? 6 : 0;
  const supportScore =
    nearestSupport && distanceToSupport <= 2
      ? 20
      : nearestSupport && distanceToSupport <= 5
        ? 12
        : 0;
  const historyScore = historicalRecoveryRate * 20;
  const smaScore = current.close < sma50 ? 8 : 0;

  const avgVolume =
    history.slice(-20).reduce((sum, point) => sum + point.volume, 0) / 20;
  const volumeScore = current.volume > avgVolume * 1.4 ? 10 : 0;

  const score = Math.min(
    100,
    Math.round(dipScore + rsiScore + supportScore + historyScore + smaScore + volumeScore)
  );

  return {
    score,
    dipPercent,
    rsi,
    nearestSupport,
    distanceToSupport,
    historicalRecoveryRate,
    avgRecoveryDays,
  };
}

export function scoreShortOpportunity(
  history: PricePoint[],
  resistanceLevels: ResistanceLevel[],
  supportLevels: ResistanceLevel[]
): {
  score: number;
  dipPercent: number;
  rsi: number;
  nearestResistance: ResistanceLevel | null;
  nearestSupport: ResistanceLevel | null;
  distanceToSupport: number;
} {
  if (history.length < 50) {
    return {
      score: 0,
      dipPercent: 0,
      rsi: 50,
      nearestResistance: null,
      nearestSupport: null,
      distanceToSupport: 100,
    };
  }

  const closes = history.map((point) => point.close);
  const current = history[history.length - 1];
  const sma20 = sma(closes, 20) ?? current.close;
  const sma50 = sma(closes, 50) ?? current.close;
  const sma200 = sma(closes, 200) ?? current.close;

  const rsi = computeRSI(closes);

  const nearestSupport =
    supportLevels
      .filter((level) => level.price <= current.close * 1.02)
      .sort((a, b) => b.price - a.price)[0] ?? null;

  const nearestResistance =
    resistanceLevels
      .filter((level) => level.price >= current.close * 0.98)
      .sort((a, b) => a.price - b.price)[0] ?? null;

  const distanceToSupport = nearestSupport
    ? ((current.close - nearestSupport.price) / current.close) * 100
    : 100;

  const belowSupport =
    nearestSupport !== null && current.close < nearestSupport.price * 0.99;
  const overextended = ((current.close - sma200) / sma200) * 100;
  const downtrend = current.close < sma20 && current.close < sma50;

  let score = 0;
  let dipPercent = 0;

  if (belowSupport && downtrend) {
    dipPercent = Math.abs(
      ((nearestSupport!.price - current.close) / nearestSupport!.price) * 100
    );
    score += 35 + Math.min(15, dipPercent * 2);
    if (rsi < 45) score += 10;
  } else if (overextended > 12) {
    dipPercent = overextended;
    score += 25 + Math.min(20, overextended);
    if (rsi > 70) score += 15;
    if (nearestResistance && current.close > nearestResistance.price * 0.98) {
      score += 10;
    }
  } else if (downtrend && rsi < 40) {
    dipPercent = ((sma20 - current.close) / sma20) * 100;
    score += 20 + Math.min(15, Math.max(0, dipPercent));
  }

  const avgVolume =
    history.slice(-20).reduce((sum, point) => sum + point.volume, 0) / 20;
  if (current.volume > avgVolume * 1.3 && belowSupport) score += 10;

  return {
    score: Math.min(100, Math.round(score)),
    dipPercent: Math.max(0, dipPercent),
    rsi,
    nearestResistance,
    nearestSupport,
    distanceToSupport,
  };
}

function computeTrueRanges(history: PricePoint[]): number[] {
  const trueRanges: number[] = [];

  for (let i = 1; i < history.length; i++) {
    const current = history[i];
    const previous = history[i - 1];
    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      )
    );
  }

  return trueRanges;
}

/** Wilder-smoothed ATR(14) — same smoothing convention as RSI in this module. */
export function computeATR(history: PricePoint[], period = 14): number {
  const trueRanges = computeTrueRanges(history);
  if (trueRanges.length === 0) return 0;

  if (trueRanges.length < period) {
    return trueRanges.reduce((sum, value) => sum + value, 0) / trueRanges.length;
  }

  let atr =
    trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
}

function computeDailyLogVolatility(history: PricePoint[], lookback = 60): number {
  const slice = history.slice(-(lookback + 1));
  if (slice.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].close;
    const curr = slice[i].close;
    if (prev > 0 && curr > 0) {
      returns.push(Math.log(curr / prev));
    }
  }

  if (returns.length < 2) return 0;

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (returns.length - 1);

  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
}

function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

interface InternalStopCandidate {
  id: string;
  method: string;
  price: number;
  formula: string;
  rationale: string;
}

export interface StopLossPlan {
  stopLossPrice: number;
  stopLossPercent: number;
  stopLossLabel: string;
  stopLossReason: string;
  stopLossCalculation: string;
  stopLossReasons: StopLossReasonDetail[];
  stopLossWinningMethod: string;
}

function isValidLongStop(price: number, entryPrice: number): boolean {
  return price < entryPrice * 0.995 && price > entryPrice * 0.85;
}

function isValidShortStop(price: number, entryPrice: number): boolean {
  return price > entryPrice * 1.005 && price < entryPrice * 1.15;
}

function buildLongStopCandidates(
  entryPrice: number,
  nearestSupport: ResistanceLevel | null,
  history: PricePoint[],
  pastDips: PastDipRecovery[]
): {
  candidates: InternalStopCandidate[];
  atr: number;
  dailyVol: number;
  annualVol: number;
  maxLossPct: number;
} {
  const atr = computeATR(history);
  const atrPct = entryPrice > 0 ? atr / entryPrice : 0;
  const dailyVol = computeDailyLogVolatility(history);
  const annualVol = dailyVol * Math.sqrt(252);
  const maxLossPct = clamp(annualVol * 0.35, 0.04, 0.15);

  const supportBufferPct = clamp(atrPct * 0.5, 0.01, 0.025);
  const supportStop = nearestSupport
    ? roundPrice(nearestSupport.price * (1 - supportBufferPct))
    : roundPrice(entryPrice * 0.92);

  const atrStop15 = roundPrice(entryPrice - 1.5 * atr);
  const atrStop20 = roundPrice(entryPrice - 2 * atr);
  const volatilityStop = roundPrice(entryPrice * (1 - maxLossPct));

  const candidates: InternalStopCandidate[] = [
    {
      id: "support-buffer",
      method: "Support invalidation",
      price: supportStop,
      formula: nearestSupport
        ? `$${nearestSupport.price.toFixed(2)} × (1 − ${formatPct(supportBufferPct, 2)}) = $${supportStop.toFixed(2)}`
        : `$${entryPrice.toFixed(2)} × 0.92 = $${supportStop.toFixed(2)} (no support — 8% fallback)`,
      rationale: nearestSupport
        ? `Buffer ${formatPct(supportBufferPct, 2)} below ${nearestSupport.label} support scales with ATR (${formatPct(atrPct, 2)}/day) so routine wicks do not stop you out before a true breakdown.`
        : "No clustered support found — uses an 8% structural fallback below entry.",
    },
    {
      id: "atr-1.5",
      method: "1.5× ATR(14)",
      price: atrStop15,
      formula: `$${entryPrice.toFixed(2)} − 1.5 × $${atr.toFixed(2)} = $${atrStop15.toFixed(2)}`,
      rationale: `Wilder ATR(14) = $${atr.toFixed(2)} (${formatPct(atrPct, 2)} of entry). 1.5× ATR is a standard noise floor for daily bars.`,
    },
    {
      id: "atr-2.0",
      method: "2.0× ATR(14)",
      price: atrStop20,
      formula: `$${entryPrice.toFixed(2)} − 2.0 × $${atr.toFixed(2)} = $${atrStop20.toFixed(2)}`,
      rationale: "Chandelier-style 2× ATR allows slightly more room on volatile names while still exiting on sustained breakdown.",
    },
    {
      id: "vol-cap",
      method: "Volatility loss cap",
      price: volatilityStop,
      formula: `$${entryPrice.toFixed(2)} × (1 − ${formatPct(maxLossPct, 2)}) = $${volatilityStop.toFixed(2)}`,
      rationale: `60-day log σ = ${formatPct(dailyVol, 2)}/day → ${formatPct(annualVol, 1)} ann. (√252). Cap = 35% of ann. vol, clamped to 4–15%.`,
    },
  ];

  const failedDips = pastDips.filter(
    (dip) => !dip.recoveredFully || dip.gain10d < 0
  );
  if (failedDips.length > 0) {
    const extensions = failedDips.map((dip) =>
      clamp((dip.dipPercent / 100) * 0.35, 0.03, 0.12)
    );
    const avgExtension =
      extensions.reduce((sum, value) => sum + value, 0) / extensions.length;
    const historicalStop = roundPrice(entryPrice * (1 - avgExtension));

    candidates.push({
      id: "historical-failed",
      method: "Failed-dip history",
      price: historicalStop,
      formula: `$${entryPrice.toFixed(2)} × (1 − ${formatPct(avgExtension, 2)}) = $${historicalStop.toFixed(2)}`,
      rationale: `${failedDips.length} past dip(s) on this symbol failed to recover (avg extension ${formatPct(avgExtension, 2)} below entry).`,
    });
  }

  return { candidates, atr, dailyVol, annualVol, maxLossPct };
}

function buildShortStopCandidates(
  entryPrice: number,
  nearestResistance: ResistanceLevel | null,
  history: PricePoint[],
  pastDips: PastDipRecovery[]
): {
  candidates: InternalStopCandidate[];
  atr: number;
  dailyVol: number;
  annualVol: number;
  maxLossPct: number;
} {
  const atr = computeATR(history);
  const atrPct = entryPrice > 0 ? atr / entryPrice : 0;
  const dailyVol = computeDailyLogVolatility(history);
  const annualVol = dailyVol * Math.sqrt(252);
  const maxLossPct = clamp(annualVol * 0.35, 0.04, 0.15);

  const resistanceBufferPct = clamp(atrPct * 0.5, 0.01, 0.025);
  const resistanceStop = nearestResistance
    ? roundPrice(nearestResistance.price * (1 + resistanceBufferPct))
    : roundPrice(entryPrice * 1.08);

  const atrStop15 = roundPrice(entryPrice + 1.5 * atr);
  const atrStop20 = roundPrice(entryPrice + 2 * atr);
  const volatilityStop = roundPrice(entryPrice * (1 + maxLossPct));

  const candidates: InternalStopCandidate[] = [
    {
      id: "resistance-buffer",
      method: "Resistance invalidation",
      price: resistanceStop,
      formula: nearestResistance
        ? `$${nearestResistance.price.toFixed(2)} × (1 + ${formatPct(resistanceBufferPct, 2)}) = $${resistanceStop.toFixed(2)}`
        : `$${entryPrice.toFixed(2)} × 1.08 = $${resistanceStop.toFixed(2)} (no resistance — 8% fallback)`,
      rationale: nearestResistance
        ? `Buffer ${formatPct(resistanceBufferPct, 2)} above ${nearestResistance.label} resistance — cover if price reclaims the level with conviction.`
        : "No clustered resistance found — uses an 8% structural fallback above entry.",
    },
    {
      id: "atr-1.5",
      method: "1.5× ATR(14)",
      price: atrStop15,
      formula: `$${entryPrice.toFixed(2)} + 1.5 × $${atr.toFixed(2)} = $${atrStop15.toFixed(2)}`,
      rationale: `Wilder ATR(14) = $${atr.toFixed(2)} (${formatPct(atrPct, 2)} of entry). 1.5× ATR limits upside pain from normal volatility.`,
    },
    {
      id: "atr-2.0",
      method: "2.0× ATR(14)",
      price: atrStop20,
      formula: `$${entryPrice.toFixed(2)} + 2.0 × $${atr.toFixed(2)} = $${atrStop20.toFixed(2)}`,
      rationale: "2× ATR gives volatile shorts slightly more room before the thesis is invalidated.",
    },
    {
      id: "vol-cap",
      method: "Volatility loss cap",
      price: volatilityStop,
      formula: `$${entryPrice.toFixed(2)} × (1 + ${formatPct(maxLossPct, 2)}) = $${volatilityStop.toFixed(2)}`,
      rationale: `60-day log σ = ${formatPct(dailyVol, 2)}/day → ${formatPct(annualVol, 1)} ann. (√252). Cap = 35% of ann. vol, clamped to 4–15%.`,
    },
  ];

  const strongRecoveries = pastDips.filter((dip) => dip.gain10d > 3);
  if (strongRecoveries.length > 0) {
    const overshoots = strongRecoveries.map((dip) =>
      clamp((dip.gain10d / 100) * 0.4, 0.03, 0.12)
    );
    const avgOvershoot =
      overshoots.reduce((sum, value) => sum + value, 0) / overshoots.length;
    const historicalStop = roundPrice(entryPrice * (1 + avgOvershoot));

    candidates.push({
      id: "historical-recovery",
      method: "Strong-recovery history",
      price: historicalStop,
      formula: `$${entryPrice.toFixed(2)} × (1 + ${formatPct(avgOvershoot, 2)}) = $${historicalStop.toFixed(2)}`,
      rationale: `${strongRecoveries.length} past dip(s) rallied ${formatPct(avgOvershoot, 2)}+ within 10 days — cover before a similar squeeze.`,
    });
  }

  return { candidates, atr, dailyVol, annualVol, maxLossPct };
}

function finalizeLongStopPlan(
  entryPrice: number,
  nearestSupport: ResistanceLevel | null,
  built: ReturnType<typeof buildLongStopCandidates>,
  trCount: number
): StopLossPlan {
  const { candidates, atr, maxLossPct } = built;

  const evaluated = candidates.map((candidate) => ({
    ...candidate,
    valid: isValidLongStop(candidate.price, entryPrice),
  }));

  const valid = evaluated.filter((candidate) => candidate.valid);
  const fallback = roundPrice(
    Math.min(
      candidates.find((c) => c.id === "support-buffer")?.price ?? entryPrice * 0.93,
      entryPrice * 0.93
    )
  );

  const winner =
    valid.length > 0
      ? valid.reduce((best, current) =>
          current.price > best.price ? current : best
        )
      : {
          id: "fallback",
          method: "Conservative fallback",
          price: fallback,
          formula: `min(support stop, entry × 0.93) = $${fallback.toFixed(2)}`,
          rationale: "No candidate fit the 0.5–15% band — using conservative 7% floor.",
          valid: true,
        };

  const stopLossPrice = winner.price;
  const stopLossPercent = ((entryPrice - stopLossPrice) / entryPrice) * 100;

  const stopLossReasons: StopLossReasonDetail[] = [
    {
      id: "atr-wilder",
      category: "calculation",
      title: "Wilder ATR(14)",
      detail: `True Range = max(H−L, |H−prevC|, |L−prevC|) over ${trCount} daily bar${trCount === 1 ? "" : "s"}; smoothed with Wilder's method (same as RSI). Current ATR = $${atr.toFixed(2)} (${formatPct(atr / entryPrice, 2)} of $${entryPrice.toFixed(2)} entry).`,
    },
    ...evaluated.map((candidate) => ({
      id: `calc-${candidate.id}`,
      category: "calculation" as const,
      title: candidate.method,
      detail: `${candidate.formula}. ${candidate.rationale}${candidate.valid ? "" : " (Outside 0.5–15% band — excluded from selection.)"}`,
    })),
  ];

  if (nearestSupport) {
    stopLossReasons.push({
      id: "tech-support",
      category: "technical",
      title: "Support level context",
      detail: `${nearestSupport.label} at $${nearestSupport.price.toFixed(2)} (${nearestSupport.touches} touch${nearestSupport.touches === 1 ? "" : "es"}, strength ${nearestSupport.strength}). Stop sits below this shelf so a clean breakdown triggers exit before deeper selloff.`,
    });
  }

  const losers = valid.filter((c) => c.id !== winner.id);
  let selectionDetail = `Long stops use the highest valid price (tightest loss) among methods. Winner: ${winner.method} at $${stopLossPrice.toFixed(2)} (${stopLossPercent.toFixed(2)}% below entry).`;

  if (losers.length > 0) {
    const comparisons = losers
      .map((loser) => {
        const loserLoss = ((entryPrice - loser.price) / entryPrice) * 100;
        return `${loser.method} at $${loser.price.toFixed(2)} (${loserLoss.toFixed(2)}% loss) is wider — rejected because $${stopLossPrice.toFixed(2)} caps loss sooner while still respecting noise and invalidation levels.`;
      })
      .join(" ");
    selectionDetail += ` ${comparisons}`;
  } else if (winner.id === "fallback") {
    selectionDetail +=
      " All primary methods fell outside bounds; fallback limits downside to ~7%.";
  } else {
    selectionDetail += " This was the only method within the valid band.";
  }

  stopLossReasons.push({
    id: "selection-winner",
    category: "selection",
    title: `Why $${stopLossPrice.toFixed(2)} is optimal`,
    detail: selectionDetail,
  });

  const stopLossLabel = nearestSupport
    ? `Limit sell at $${stopLossPrice.toFixed(2)} if price breaks support`
    : `Limit sell at $${stopLossPrice.toFixed(2)} (${stopLossPercent.toFixed(1)}% safety stop)`;

  const stopLossReason = nearestSupport
    ? `If ${nearestSupport.label} support at $${nearestSupport.price.toFixed(2)} fails, exit to cap losses before a deeper selloff.`
    : `Volatility-based stop limits downside if the dip continues without a bounce.`;

  const validSummary = valid
    .map((c) => `${c.method} $${c.price.toFixed(2)}`)
    .join(", ");

  const stopLossCalculation = `Entry $${entryPrice.toFixed(2)} → max(${valid.length > 0 ? validSummary : `fallback $${fallback.toFixed(2)}`}) = $${stopLossPrice.toFixed(2)} (${stopLossPercent.toFixed(2)}% max loss). Vol cap ${formatPct(maxLossPct, 2)} from 60d log σ × √252.`;

  return {
    stopLossPrice,
    stopLossPercent,
    stopLossLabel,
    stopLossReason,
    stopLossCalculation,
    stopLossReasons,
    stopLossWinningMethod: winner.method,
  };
}

function finalizeShortStopPlan(
  entryPrice: number,
  nearestResistance: ResistanceLevel | null,
  built: ReturnType<typeof buildShortStopCandidates>,
  trCount: number
): StopLossPlan {
  const { candidates, atr, maxLossPct } = built;

  const evaluated = candidates.map((candidate) => ({
    ...candidate,
    valid: isValidShortStop(candidate.price, entryPrice),
  }));

  const valid = evaluated.filter((candidate) => candidate.valid);
  const fallback = roundPrice(
    Math.max(
      candidates.find((c) => c.id === "resistance-buffer")?.price ?? entryPrice * 1.07,
      entryPrice * 1.07
    )
  );

  const winner =
    valid.length > 0
      ? valid.reduce((best, current) =>
          current.price < best.price ? current : best
        )
      : {
          id: "fallback",
          method: "Conservative fallback",
          price: fallback,
          formula: `max(resistance stop, entry × 1.07) = $${fallback.toFixed(2)}`,
          rationale: "No candidate fit the 0.5–15% band — using conservative 7% ceiling.",
          valid: true,
        };

  const stopLossPrice = winner.price;
  const stopLossPercent = ((stopLossPrice - entryPrice) / entryPrice) * 100;

  const stopLossReasons: StopLossReasonDetail[] = [
    {
      id: "atr-wilder",
      category: "calculation",
      title: "Wilder ATR(14)",
      detail: `True Range = max(H−L, |H−prevC|, |L−prevC|) over ${trCount} daily bar${trCount === 1 ? "" : "s"}; Wilder-smoothed over 14 periods. Current ATR = $${atr.toFixed(2)} (${formatPct(atr / entryPrice, 2)} of $${entryPrice.toFixed(2)} entry).`,
    },
    ...evaluated.map((candidate) => ({
      id: `calc-${candidate.id}`,
      category: "calculation" as const,
      title: candidate.method,
      detail: `${candidate.formula}. ${candidate.rationale}${candidate.valid ? "" : " (Outside 0.5–15% band — excluded from selection.)"}`,
    })),
  ];

  if (nearestResistance) {
    stopLossReasons.push({
      id: "tech-resistance",
      category: "technical",
      title: "Resistance level context",
      detail: `${nearestResistance.label} at $${nearestResistance.price.toFixed(2)} (${nearestResistance.touches} touch${nearestResistance.touches === 1 ? "" : "es"}, strength ${nearestResistance.strength}). Stop sits above this ceiling — a reclaim invalidates the short.`,
    });
  }

  const losers = valid.filter((c) => c.id !== winner.id);
  let selectionDetail = `Short cover stops use the lowest valid price (tightest loss) among methods. Winner: ${winner.method} at $${stopLossPrice.toFixed(2)} (${stopLossPercent.toFixed(2)}% above entry).`;

  if (losers.length > 0) {
    const comparisons = losers
      .map((loser) => {
        const loserLoss = ((loser.price - entryPrice) / entryPrice) * 100;
        return `${loser.method} at $${loser.price.toFixed(2)} (${loserLoss.toFixed(2)}% loss) is wider — rejected because $${stopLossPrice.toFixed(2)} limits reversal damage sooner.`;
      })
      .join(" ");
    selectionDetail += ` ${comparisons}`;
  } else if (winner.id === "fallback") {
    selectionDetail +=
      " All primary methods fell outside bounds; fallback limits upside pain to ~7%.";
  } else {
    selectionDetail += " This was the only method within the valid band.";
  }

  stopLossReasons.push({
    id: "selection-winner",
    category: "selection",
    title: `Why $${stopLossPrice.toFixed(2)} is optimal`,
    detail: selectionDetail,
  });

  const stopLossLabel = nearestResistance
    ? `Cover at $${stopLossPrice.toFixed(2)} if price reclaims resistance`
    : `Cover at $${stopLossPrice.toFixed(2)} (${stopLossPercent.toFixed(1)}% stop)`;

  const stopLossReason = nearestResistance
    ? `If price breaks back above resistance at $${nearestResistance.price.toFixed(2)}, the short thesis is invalid — cover to limit losses.`
    : `ATR-based stop caps upside pain if the stock reverses against the short.`;

  const validSummary = valid
    .map((c) => `${c.method} $${c.price.toFixed(2)}`)
    .join(", ");

  const stopLossCalculation = `Entry $${entryPrice.toFixed(2)} → min(${valid.length > 0 ? validSummary : `fallback $${fallback.toFixed(2)}`}) = $${stopLossPrice.toFixed(2)} (${stopLossPercent.toFixed(2)}% max loss). Vol cap ${formatPct(maxLossPct, 2)} from 60d log σ × √252.`;

  return {
    stopLossPrice,
    stopLossPercent,
    stopLossLabel,
    stopLossReason,
    stopLossCalculation,
    stopLossReasons,
    stopLossWinningMethod: winner.method,
  };
}

export function computeLongStopLoss(
  entryPrice: number,
  nearestSupport: ResistanceLevel | null,
  history: PricePoint[],
  pastDips: PastDipRecovery[] = []
): StopLossPlan {
  const built = buildLongStopCandidates(
    entryPrice,
    nearestSupport,
    history,
    pastDips
  );
  const trCount = computeTrueRanges(history).length;
  const plan = finalizeLongStopPlan(entryPrice, nearestSupport, built, trCount);

  const failedDips = pastDips.filter(
    (dip) => !dip.recoveredFully || dip.gain10d < 0
  );
  if (failedDips.length > 0) {
    plan.stopLossReasons.splice(1, 0, {
      id: "hist-failed-dips",
      category: "historical",
      title: "Failed dip sample",
      detail: `${failedDips.length} of ${pastDips.length} historical dip(s) did not recover within 10 days — stop width incorporates this downside follow-through.`,
    });
  }

  return plan;
}

export function computeShortStopLoss(
  entryPrice: number,
  nearestResistance: ResistanceLevel | null,
  history: PricePoint[],
  pastDips: PastDipRecovery[] = []
): StopLossPlan {
  const built = buildShortStopCandidates(
    entryPrice,
    nearestResistance,
    history,
    pastDips
  );
  const trCount = computeTrueRanges(history).length;
  const plan = finalizeShortStopPlan(
    entryPrice,
    nearestResistance,
    built,
    trCount
  );

  const strongRecoveries = pastDips.filter((dip) => dip.gain10d > 3);
  if (strongRecoveries.length > 0) {
    plan.stopLossReasons.splice(1, 0, {
      id: "hist-strong-recoveries",
      category: "historical",
      title: "Strong recovery sample",
      detail: `${strongRecoveries.length} past dip(s) rallied >3% within 10 days — cover stop accounts for similar squeeze risk.`,
    });
  }

  return plan;
}
