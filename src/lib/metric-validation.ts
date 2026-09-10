export function reconcileBeta(
  calculated: number,
  referenceBeta: number | null | undefined
): { value: number; source: string } {
  if (
    referenceBeta == null ||
    !Number.isFinite(referenceBeta) ||
    referenceBeta <= 0 ||
    referenceBeta > 5
  ) {
    return { value: calculated, source: "Calculated vs SPY (252d aligned)" };
  }

  const relativeDiff =
    Math.abs(calculated - referenceBeta) / Math.max(Math.abs(referenceBeta), 0.05);

  if (relativeDiff <= 0.3) {
    return {
      value: calculated * 0.65 + referenceBeta * 0.35,
      source: "65% calculated + 35% Yahoo defaultKeyStatistics",
    };
  }

  return {
    value: calculated,
    source: "Calculated vs SPY (Yahoo beta diverged >30%)",
  };
}

export function reconcileVolatility(
  calculated: number,
  referenceVol: number | null | undefined
): { value: number; source: string } {
  if (
    referenceVol == null ||
    !Number.isFinite(referenceVol) ||
    referenceVol <= 0 ||
    referenceVol > 3
  ) {
    return { value: calculated, source: "Log-return std × √252" };
  }

  const relativeDiff =
    Math.abs(calculated - referenceVol) / Math.max(referenceVol, 0.05);

  if (relativeDiff <= 0.25) {
    return {
      value: calculated * 0.7 + referenceVol * 0.3,
      source: "70% calculated + 30% Yahoo summaryDetail",
    };
  }

  return { value: calculated, source: "Log-return std × √252" };
}
