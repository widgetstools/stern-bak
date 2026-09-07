/**
 * The ISDA standard credit model: a flat hazard rate bootstrapped from a
 * quoted spread.
 *
 * A credit default swap has two legs. The PREMIUM leg pays a fixed coupon
 * quarterly until default or maturity, plus the accrued coupon at default —
 * modelled at the period midpoint, which is the standard approximation. The
 * PROTECTION leg pays `(1 - R)` at default.
 *
 * The par spread is the ratio of the two, and inverting that relationship for
 * the hazard rate is the bootstrap. The market quotes a flat curve per name
 * precisely so this inversion is unambiguous — it is a quoting convention, not
 * a claim that default intensity is really constant.
 *
 * Conventions that must be right: the premium leg accrues **ACT/360** on a
 * quarterly IMM schedule, so a period is about 0.2535 years rather than 0.25.
 * Using 0.25 understates the risky annuity by roughly 1.4%, which flows
 * straight into CS01 and into every upfront calculation.
 */

/** Standard recovery assumptions by seniority. */
export const RECOVERY_SENIOR_UNSECURED = 0.4;
export const RECOVERY_SUBORDINATED = 0.2;

/** Quarterly premium payments, ACT/360. */
export const CDS_FREQUENCY = 4;
const ACCRUAL_FRACTION = 365 / CDS_FREQUENCY / 360;

/** Survival probability under a flat hazard rate. */
export function survival(hazard: number, years: number): number {
  return Math.exp(-hazard * Math.max(0, years));
}

/**
 * Risky PV01: present value of one unit of spread paid on the premium leg.
 *
 * This IS the CS01 per unit of notional, which is why it is worth naming.
 * Includes accrual on default at the period midpoint.
 */
export function riskyPv01(
  hazard: number,
  discountRate: number,
  years: number,
  frequency = CDS_FREQUENCY,
): number {
  const periods = Math.max(1, Math.round(years * frequency));
  const accrual = 365 / frequency / 360;
  let total = 0;
  let previousSurvival = 1;
  for (let i = 1; i <= periods; i++) {
    const t = i / frequency;
    const df = Math.exp(-discountRate * t);
    const q = survival(hazard, t);
    total += accrual * df * (q + 0.5 * (previousSurvival - q));
    previousSurvival = q;
  }
  return total;
}

/**
 * Protection leg present value, per unit of notional.
 *
 * Integrated on a monthly grid with the discount taken at the midpoint of each
 * step, because default can happen at any time rather than only on payment
 * dates.
 */
export function protectionLeg(
  hazard: number,
  discountRate: number,
  recovery: number,
  years: number,
  stepsPerYear = 12,
): number {
  const steps = Math.max(1, Math.round(years * stepsPerYear));
  const dt = 1 / stepsPerYear;
  let total = 0;
  let previousSurvival = 1;
  for (let j = 1; j <= steps; j++) {
    const t = j * dt;
    const df = Math.exp(-discountRate * (t - dt / 2));
    const q = survival(hazard, t);
    total += (1 - recovery) * df * (previousSurvival - q);
    previousSurvival = q;
  }
  return total;
}

/** The par spread implied by a hazard rate, as a decimal (0.0078 is 78 bp). */
export function parSpreadFromHazard(
  hazard: number,
  discountRate: number,
  recovery: number,
  years: number,
): number {
  const annuity = riskyPv01(hazard, discountRate, years);
  return annuity <= 0 ? 0 : protectionLeg(hazard, discountRate, recovery, years) / annuity;
}

/**
 * The credit triangle: `lambda ~ S / (1 - R)`.
 *
 * Exact only in continuous time with no discounting, but within a couple of
 * percent in practice — which makes it the right seed for the solve below,
 * cutting it to a handful of iterations.
 */
export function creditTriangle(spread: number, recovery: number): number {
  return recovery >= 1 ? 0 : spread / (1 - recovery);
}

/** Bootstrap the flat hazard rate from a quoted par spread. */
export function solveHazardFromSpread(
  spread: number,
  discountRate: number,
  recovery: number,
  years: number,
  tolerance = 1e-12,
): number {
  if (spread <= 0) return 0;
  let low = 1e-9;
  let high = Math.max(5, creditTriangle(spread, recovery) * 4);
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const par = parSpreadFromHazard(mid, discountRate, recovery, years);
    if (Math.abs(par - spread) < tolerance) return mid;
    if (par > spread) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

/** Cumulative default probability to a horizon. */
export function defaultProbability(hazard: number, years: number): number {
  return 1 - survival(hazard, years);
}

export { ACCRUAL_FRACTION };
