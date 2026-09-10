import { qualityRankBoost } from "./business-quality";
import type { BreakoutCandidate, DipCandidate } from "./types";

export function rankBreakoutCandidates(
  candidates: BreakoutCandidate[]
): BreakoutCandidate[] {
  return [...candidates].sort((a, b) => {
    const scoreA =
      a.likelihoodScore + qualityRankBoost(a.businessQuality?.grade, "long");
    const scoreB =
      b.likelihoodScore + qualityRankBoost(b.businessQuality?.grade, "long");
    if (scoreB !== scoreA) return scoreB - scoreA;
    if (b.historicalSuccessRate !== a.historicalSuccessRate) {
      return b.historicalSuccessRate - a.historicalSuccessRate;
    }
    return a.distanceToResistance - b.distanceToResistance;
  });
}

export function rankDipCandidates(candidates: DipCandidate[]): DipCandidate[] {
  return [...candidates].sort((a, b) => {
    const scoreA =
      a.recoveryScore +
      qualityRankBoost(a.businessQuality?.grade, a.direction);
    const scoreB =
      b.recoveryScore +
      qualityRankBoost(b.businessQuality?.grade, b.direction);
    if (scoreB !== scoreA) return scoreB - scoreA;
    if (b.historicalRecoveryRate !== a.historicalRecoveryRate) {
      return b.historicalRecoveryRate - a.historicalRecoveryRate;
    }
    if (b.dipPercent !== a.dipPercent) {
      return b.dipPercent - a.dipPercent;
    }
    return Math.abs(b.rsi - 30) - Math.abs(a.rsi - 30);
  });
}
