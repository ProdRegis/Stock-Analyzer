import type { BreakoutCandidate, DipCandidate } from "./types";

export function rankBreakoutCandidates(
  candidates: BreakoutCandidate[]
): BreakoutCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.likelihoodScore !== a.likelihoodScore) {
      return b.likelihoodScore - a.likelihoodScore;
    }
    if (b.historicalSuccessRate !== a.historicalSuccessRate) {
      return b.historicalSuccessRate - a.historicalSuccessRate;
    }
    return a.distanceToResistance - b.distanceToResistance;
  });
}

export function rankDipCandidates(candidates: DipCandidate[]): DipCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.recoveryScore !== a.recoveryScore) {
      return b.recoveryScore - a.recoveryScore;
    }
    if (b.historicalRecoveryRate !== a.historicalRecoveryRate) {
      return b.historicalRecoveryRate - a.historicalRecoveryRate;
    }
    if (b.dipPercent !== a.dipPercent) {
      return b.dipPercent - a.dipPercent;
    }
    return Math.abs(b.rsi - 30) - Math.abs(a.rsi - 30);
  });
}
