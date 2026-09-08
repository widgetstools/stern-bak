/**
 * The instruments a hedge may be built from, and what each one does to risk.
 *
 * A hedge universe is not "every security in the book". A desk hedges with the
 * things it can actually trade in size at a screen price: on-the-run Treasuries
 * for curve risk, liquid single-name and index CDS for credit, TBAs for
 * mortgage basis. Offering an off-the-run 2041 muni as a hedge instrument is
 * how a solver produces a package nobody can execute.
 *
 * Each candidate carries its sensitivity in the SAME five-factor basis the
 * scenario engine moves — the four NSS curve factors plus the systematic credit
 * factor. That is deliberate and load-bearing: a hedge solved in one basis and
 * verified in another would be measuring two different things, and the
 * verification would prove nothing.
 */

import type { Security } from '../domain/instruments/types.js';
import { halfSpreadPoints } from '../domain/book/positions.js';
import { priceSecurity, type ValuationContext } from '../domain/book/valuation.js';

/** Sensitivity per $1mm of notional, in currency. */
export interface HedgeCandidate {
  securityId: number;
  cusip: string;
  description: string;
  assetClass: string;
  /** What kind of ticket this becomes. */
  instrumentKind: 'Treasury' | 'CDS' | 'CDX' | 'TBA' | 'Corporate';
  /** d(value) per unit move in each factor, per $1mm notional. */
  gradient: [number, number, number, number, number];
  /** Annual coupon income per $1mm, in currency. Negative for a paid premium. */
  carryPerMm: number;
  /** Half the bid-ask in points — what crossing costs, per 100. */
  halfSpreadPoints: number;
  price: number;
  maturityDate: number;
  benchmarkTenor: number;
  liquidityTier: string;
}

/** Cost of putting on `notionalMm` of a candidate, in currency. */
export function executionCost(candidate: HedgeCandidate, notionalMm: number): number {
  return (Math.abs(notionalMm) * 1e6 * candidate.halfSpreadPoints) / 100;
}

/**
 * Whether an instrument is liquid enough to hedge with.
 *
 * On-the-run Treasuries, credit indices, single-name CDS. The alternative —
 * letting the solver reach for whatever minimises the residual — reliably picks
 * the most illiquid thing available, because an odd instrument is exactly what
 * fills an awkward corner of the constraint space.
 */
function isTradeable(security: Security): boolean {
  if (security.assetClass === 'Rates') {
    return security.onTheRunRank !== null && security.onTheRunRank <= 1
      && security.securityType !== 'TBill';
  }
  return security.assetClass === 'CDS';
}

function kindOf(security: Security): HedgeCandidate['instrumentKind'] {
  if (security.securityType === 'CdsIndex') return 'CDX';
  if (security.assetClass === 'CDS') return 'CDS';
  if (security.assetClass === 'Rates') return 'Treasury';
  if (security.assetClass === 'AgencyMBS') return 'TBA';
  return 'Corporate';
}

export interface UniverseInput {
  /** The SECURITY MASTER, not the book. */
  securities: readonly Security[];
  /** Spread to price each candidate at, in basis points, by security id. */
  spreadBpFor: (security: Security) => number;
  valuation: Omit<ValuationContext, 'spreadBp' | 'withKeyRates'>;
}

/**
 * The tradeable universe, with each instrument's per-$1mm sensitivity.
 *
 * Derived from the security master rather than from the book. A hedge
 * instrument does not have to be one you already hold — deriving candidates
 * from positions silently excluded the credit indices, which are the single
 * most useful hedge on the list and which the book happened not to own.
 */
export function buildHedgeUniverse(input: UniverseInput): HedgeCandidate[] {
  const out: HedgeCandidate[] = [];

  for (const security of input.securities) {
    if (!isTradeable(security)) continue;
    const spreadBp = input.spreadBpFor(security);
    const priced = priceSecurity(security, { ...input.valuation, spreadBp, withKeyRates: true });
    if (!Number.isFinite(priced.cleanPrice) || priced.cleanPrice <= 0) continue;

    const isSwap = security.assetClass === 'CDS';
    // Per $1mm of notional: an instrument worth `price x 1mm / 100` loses
    // `dy / 100` of itself for a duration-weighted yield move of `dy`. Same
    // expansion as `fastReval`, restricted to its first-order term.
    const weight = (priced.cleanPrice * 1e6) / 10_000;
    const spreadLevelPct = isSwap ? spreadBp / 100 : Math.max(0, priced.zSpread) / 100;
    const creditBeta = isSwap ? 1 : 0;

    out.push({
      securityId: security.securityId,
      cusip: security.cusip,
      description: security.description,
      assetClass: security.assetClass,
      instrumentKind: kindOf(security),
      gradient: [
        -weight * (priced.betaSensitivity[0] ?? 0),
        -weight * (priced.betaSensitivity[1] ?? 0),
        -weight * (priced.betaSensitivity[2] ?? 0),
        -weight * (priced.betaSensitivity[3] ?? 0),
        -weight * priced.spreadDuration * creditBeta * spreadLevelPct,
      ],
      carryPerMm: (security.couponRate / 100) * 1e6,
      halfSpreadPoints: halfSpreadPoints(security, priced.modifiedDuration),
      price: priced.cleanPrice,
      maturityDate: security.maturityDate,
      benchmarkTenor: security.benchmarkTenor,
      liquidityTier: security.liquidityTier,
    });
  }
  return out.sort((a, b) => a.benchmarkTenor - b.benchmarkTenor);
}
