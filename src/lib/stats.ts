/**
 * Small-sample statistics used to say whether a beta or correlation is
 * actually identified, rather than a noisy point estimate.
 *
 * Student's t two-tailed p-value is the regularized incomplete beta
 * I_{df/(df+t²)}(df/2, 1/2). The continued-fraction evaluation is the
 * Numerical Recipes form; log Γ is Lanczos.
 */

const LANCZOS = [
  76.18009172947146, -86.50532032941677, 24.01409824083091,
  -1.231739572450155, 0.001208650973866179, -5.395239384953e-6,
] as const;

/** ln Γ(z) for z > 0. */
export function logGamma(z: number): number {
  if (z <= 0 || !Number.isFinite(z)) return Number.NaN;

  let y = z;
  let tmp = z + 5.5;
  tmp -= (z + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const coef of LANCZOS) {
    y += 1;
    ser += coef / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / z);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIter = 200;
  const eps = 3e-12;
  const fpmin = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) <= eps) break;
  }

  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function regularizedIncompleteBeta(
  x: number,
  a: number,
  b: number
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (a <= 0 || b <= 0 || !Number.isFinite(x)) return Number.NaN;

  const logBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - logBeta);

  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/**
 * Two-tailed p-value for a Student's t with `df` degrees of freedom.
 * P(|T| > |t|) = I_{df/(df+t²)}(df/2, 1/2).
 */
export function studentTTwoTailedP(t: number, df: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return 1;
  if (t === 0) return 1;
  if (!Number.isFinite(t) || Math.abs(t) > 1e8) return 0;

  const x = df / (df + t * t);
  const p = regularizedIncompleteBeta(x, df / 2, 0.5);
  if (!Number.isFinite(p)) return 1;
  return Math.min(1, Math.max(0, p));
}

/**
 * CDF of Student's t: P(T ≤ t). Built from the two-tailed identity
 * P(|T| > |t|) so the event-forecast hit chances stay on the same
 * incomplete-beta implementation as the beta t-test.
 */
export function studentTCdf(t: number, df: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) {
    return Number.NaN;
  }
  if (t === 0) return 0.5;

  const twoTail = studentTTwoTailedP(t, df);
  return t > 0 ? 1 - twoTail / 2 : twoTail / 2;
}

/**
 * Two-sided 95% critical value of Student's t, via a Cornish–Fisher
 * expansion around the normal quantile. Fine for df ≥ 3, which is all
 * we ever have (aligned returns need 30+ observations).
 */
export function tCrit95(df: number): number {
  if (!Number.isFinite(df) || df <= 0) return Number.POSITIVE_INFINITY;
  if (df > 1000) return 1.959964;

  const z = 1.959964;
  const z2 = z * z;
  const z3 = z2 * z;
  const z5 = z3 * z2;
  const z7 = z5 * z2;
  const g1 = (z3 + z) / 4;
  const g2 = (5 * z5 + 16 * z3 + 3 * z) / 96;
  const g3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / 384;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3;
}

export function formatPValue(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "< 0.001";
  if (p < 0.01) return p.toFixed(3);
  return p.toFixed(2);
}

export function formatTStat(t: number): string {
  if (!Number.isFinite(t)) return "—";
  if (Math.abs(t) >= 100) return t >= 0 ? "> 100" : "< −100";
  return t.toFixed(1);
}
