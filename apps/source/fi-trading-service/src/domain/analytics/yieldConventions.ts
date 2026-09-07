/**
 * Quotation conventions that are not simply "the yield".
 *
 * Treasury bills are quoted on a DISCOUNT RATE, not a yield, and the two are
 * different numbers for the same instrument — a bill at a 4.50 discount rate
 * has a bond-equivalent yield near 4.63. Emitting both, correctly, is cheap
 * and is the kind of detail that separates a dataset built from conventions
 * from one built from a single price formula.
 */

/** Discount rate from a bill's price per 100. */
export function discountRateFromPrice(price: number, daysToMaturity: number): number {
  if (daysToMaturity <= 0) return 0;
  return ((100 - price) / 100) * (360 / daysToMaturity) * 100;
}

/** Price per 100 from a bill's discount rate. */
export function priceFromDiscountRate(discountRatePct: number, daysToMaturity: number): number {
  return 100 * (1 - (discountRatePct / 100) * (daysToMaturity / 360));
}

/**
 * Bond-equivalent yield of a bill.
 *
 * Under half a year the conversion is a closed form. Beyond it, the
 * semiannual compounding assumption makes it the root of a quadratic — a
 * detail most implementations skip, which then misprices every 52-week bill.
 */
export function bondEquivalentYield(discountRatePct: number, daysToMaturity: number): number {
  if (daysToMaturity <= 0) return 0;
  const d = discountRatePct / 100;
  if (daysToMaturity <= 182) {
    const denominator = 360 - d * daysToMaturity;
    if (denominator <= 0) return 0;
    return ((365 * d) / denominator) * 100;
  }
  // Past half a year the semiannual compounding assumption makes the
  // conversion the root of a quadratic. Skipping this misprices every
  // 52-week bill; the two branches agree to six decimals at the boundary.
  const price = priceFromDiscountRate(discountRatePct, daysToMaturity);
  if (price <= 0) return 0;
  const x = daysToMaturity / 365;
  const a = 2 * x - 1;
  if (a <= 0) return 0;
  const discriminant = x * x - a * (1 - 100 / price);
  if (discriminant < 0) return 0;
  return ((-2 * x + 2 * Math.sqrt(discriminant)) / a) * 100;
}

/** Coupon income as a percentage of price — not a yield, but widely quoted. */
export function currentYield(couponRate: number, cleanPrice: number): number {
  if (cleanPrice <= 0) return 0;
  return (couponRate / cleanPrice) * 100;
}

/** Convert a semiannual yield to its annual-equivalent. */
export function annualEquivalentYield(semiannualPct: number): number {
  return ((1 + semiannualPct / 200) ** 2 - 1) * 100;
}

/** Convert an annual yield to its semiannual-equivalent. */
export function semiannualEquivalentYield(annualPct: number): number {
  return ((1 + annualPct / 100) ** 0.5 - 1) * 200;
}

/** Continuously compounded equivalent of a yield compounded `frequency` times. */
export function continuousEquivalent(yieldPct: number, frequency: number): number {
  return frequency * Math.log(1 + yieldPct / 100 / frequency) * 100;
}
