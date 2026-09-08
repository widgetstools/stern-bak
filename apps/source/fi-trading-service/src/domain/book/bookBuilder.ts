/**
 * Assemble a book: securities from the issuance programs, lots with real
 * histories, positions derived from those lots, all priced off one factor
 * state.
 *
 * Two pricing paths, and the split is deliberate.
 *
 * `buildBook` prices exactly, with key-rate durations — twenty repricings per
 * security. That runs once at startup and produces the risk vector everything
 * else leans on.
 *
 * `repriceFast` is the tick path and the scenario path. It reduces a whole-book
 * revaluation to a four-element dot product against the change in the curve
 * factors, which is exact rather than approximate because the NSS decay
 * parameters are frozen. That is what makes 500 counterfactual worlds
 * affordable.
 */

import type { DateInt } from '../core/dateInt.js';
import { addYears } from '../core/dateInt.js';
import { createRng, deriveSeed, pickWeighted, uniformInt, type Rng } from '../core/rng.js';
import type { Calendar } from '../core/sifmaCalendar.js';
import { issuerSpreadAtTenor } from '../curves/creditFactors.js';
import { nssDiscountCurve } from '../curves/discount.js';
import { FactorEngine, type FactorState } from '../curves/factorEngine.js';
import { seedMortgageRates } from '../curves/mortgageRates.js';
import { ratingVector, sectorVector, buildIssuers, type Issuer } from '../instruments/creditIssuers.js';
import { buildCreditBonds } from '../instruments/creditBonds.js';
import { buildCdsEntities, entitiesWithBonds } from '../instruments/cdsEntities.js';
import { buildCdsSecurities, buildCdsIndexSecurities } from '../instruments/cdsSecurities.js';
import { buildCdsIndices } from '../instruments/cdsContracts.js';
import { buildTreasuriesFromReference } from '../instruments/treasuryReference.js';
import { buildAgencyDebentures } from '../instruments/agencyDebenture.js';
import { buildMuniDeals } from '../instruments/muniDeals.js';
import { buildMbsPools } from '../instruments/mbsPools.js';
import { buildCmbsDeals } from '../instruments/spgDealCmbs.js';
import { buildAbsDeals } from '../instruments/spgDealAbs.js';
import { buildCloDeals } from '../instruments/spgDealClo.js';
import type { Security } from '../instruments/types.js';
import type { PoolState } from '../analytics/prepay/cprModel.js';
import { deskFor, buildPositionRow, halfSpreadPoints, type PositionRow } from './positions.js';
import { formatPrice, type QuotationBasis } from '../core/tickPrice.js';
import type { Lot } from './lots.js';
import { amortizedCost } from './lots.js';
import { priceAtYield, priceSecurity, termsFor, type PricedSecurity, type ValuationContext } from './valuation.js';

export interface BookScale {
  investmentGradeIssuers: number;
  highYieldIssuers: number;
  muniDeals: number;
  mbsPoolsPerCoupon: number;
  cmbsDeals: number;
  absDealsPerSector: number;
  cloDeals: number;
  /** Share of bond issuers that also have a CDS curve. */
  cdsCoverage: number;
  /** Share of the security universe actually held. */
  heldFraction: number;
}

/** Demo scale: a book big enough to look real, small enough to build fast. */
export const DEMO_SCALE: BookScale = {
  investmentGradeIssuers: 140,
  highYieldIssuers: 90,
  muniDeals: 40,
  mbsPoolsPerCoupon: 4,
  cmbsDeals: 14,
  absDealsPerSector: 4,
  cloDeals: 12,
  cdsCoverage: 0.35,
  heldFraction: 0.62,
};

/**
 * Scale the demo universe up or down by a multiplier.
 *
 * Every dimension moves together, so the asset-class mix and the ratio of
 * securities to positions stay put and only the row count changes. Issuer and
 * deal counts keep a floor of one, because a bucket that scales to zero would
 * silently drop a whole asset class from the book.
 */
export function scaleBook(base: BookScale, multiplier: number): BookScale {
  const grow = (n: number): number => Math.max(1, Math.round(n * multiplier));
  return {
    investmentGradeIssuers: grow(base.investmentGradeIssuers),
    highYieldIssuers: grow(base.highYieldIssuers),
    muniDeals: grow(base.muniDeals),
    mbsPoolsPerCoupon: grow(base.mbsPoolsPerCoupon),
    cmbsDeals: grow(base.cmbsDeals),
    absDealsPerSector: grow(base.absDealsPerSector),
    cloDeals: grow(base.cloDeals),
    // A share, not a count: scaling the universe should not change what
    // fraction of the names have a swap on them.
    cdsCoverage: base.cdsCoverage,
    heldFraction: base.heldFraction,
  };
}

export interface BookOptions {
  asOf: DateInt;
  calendar: Calendar;
  seed: number;
  scale?: BookScale;
}

export interface BuiltBook {
  asOf: DateInt;
  securities: Security[];
  issuers: Issuer[];
  positions: PositionRow[];
  engine: FactorEngine;
  state: FactorState;
  /** Everything the fast path needs, one entry per held position. */
  riskVectors: RiskVector[];
  step(date: DateInt): FactorState;
  repriceFast(state: FactorState): PositionRow[];
  /** Current spread for any security in the master, in basis points. */
  spreadFor(security: Security): number;
}

/**
 * The per-position numbers a delta revaluation needs, and nothing else.
 *
 * Everything a tick touches lives here so the hot path reads no schedules,
 * reprices no cashflows and rolls up no lots — the three things that made a
 * first attempt at this cost 54 ms a day instead of a fraction of one.
 */
export interface RiskVector {
  positionId: string;
  securityId: number;
  /** Sensitivity to each of the four curve factors. */
  beta: [number, number, number, number];
  spreadDuration: number;
  convexity: number;
  /** Loading on the systematic credit factor. */
  creditBeta: number;
  currentFace: number;
  basePrice: number;
  issuerId: number;
  /** Cost basis in currency, fixed intraday. */
  costBasis: number;
  accruedCash: number;
  duration: number;
  /** A swap marks to its upfront, not to its notional. */
  isSwap: boolean;
  /** Current spread level in percent — the base a relative widening applies to. */
  spreadLevelPct: number;
  /** Levels at the build state, so every revaluation measures from the same origin. */
  baseYtm: number;
  baseYtw: number;
  baseZSpread: number;
  baseOas: number;
  halfSpreadPoints: number;
  quotationBasis: QuotationBasis;
}

interface Holding {
  positionId: string;
  security: Security;
  priced: PricedSecurity;
  lots: Lot[];
  pool?: PoolState;
  spreadBp: number;
}

export function spreadForSecurity(security: Security, issuer: Issuer | undefined, state: FactorState, engine: FactorEngine): number {
  if (security.assetClass === 'Rates') return 0;
  if (issuer === undefined) return security.issueSpreadBp;
  const base = engine.issuerSpread(state, issuer.issuerId, issuer.baseSpread5yBp);
  return Math.max(1, issuerSpreadAtTenor(base, Math.max(0.25, security.benchmarkTenor)));
}

/**
 * Seed lots with real histories.
 *
 * The purchase yield comes from a backward drift, so a bond bought four years
 * ago was bought when rates were lower — and therefore shows a premium and an
 * unrealised loss today. Setting cost bases to today's price instead would
 * produce a book with no P&L dispersion at all, which is the giveaway.
 */
function seedLots(
  positionId: string,
  security: Security,
  calendar: Calendar,
  asOf: DateInt,
  currentYield: number,
  rng: Rng,
): Lot[] {
  const lotCount = uniformInt(rng, 1, 4);
  const lots: Lot[] = [];
  const baseFace = pickWeighted(rng, [1e6, 2e6, 5e6, 1e7, 2.5e7], [26, 24, 24, 18, 8]);

  // You cannot hold what has not settled. Muni deals price weeks before
  // delivery, so the universe legitimately carries bonds dated forward of
  // today; they belong in the security master and in when-issued trading, not
  // in inventory.
  if (security.issueDate > asOf) return [];

  // A lot cannot predate the security either. A four-week bill issued last
  // month showing a purchase from four years ago is the kind of detail that
  // makes a book obviously synthetic, and it poisons the holding-period and
  // amortisation columns for every short-dated instrument.
  const maxYearsAgo = Math.min(5, Math.max(0, Math.trunc((asOf - security.issueDate) / 10_000)));

  for (let i = 0; i < lotCount; i++) {
    const yearsAgo = uniformInt(rng, 0, maxYearsAgo);
    const openDate = Math.max(security.issueDate, addYears(asOf, -yearsAgo));
    if (openDate >= security.maturityDate) continue;
    const purchaseYield = Math.max(0.3, currentYield - yearsAgo * 0.42 + (rng() - 0.5) * 0.4);
    const face = Math.round((baseFace * (0.5 + rng())) / 100_000) * 100_000;
    if (face <= 0) continue;

    lots.push({
      lotId: `${positionId}-L${i + 1}`,
      positionId,
      securityId: security.securityId,
      openTradeId: `TRD-${security.securityId}-${i + 1}`,
      openDate,
      settleDate: openDate,
      side: 'LONG',
      originalFace: face,
      remainingFace: face,
      purchasePriceClean: priceAtYield(security, calendar, openDate, purchaseYield),
      purchaseYield,
      accruedAtPurchase: 0,
      closedDate: null,
      realizedPnl: 0,
    });
  }
  return lots;
}

/** Build the whole security universe from the issuance programs. */
function buildUniverse(
  options: BookOptions,
  scale: BookScale,
  historicalYield: (date: DateInt, tenor: number) => number,
  scaleYield: (tenor: number) => number,
): { securities: Security[]; issuers: Issuer[]; pools: Map<number, PoolState> } {
  const { asOf, calendar, seed } = options;
  const issuers = buildIssuers({
    seed,
    investmentGrade: scale.investmentGradeIssuers,
    highYield: scale.highYieldIssuers,
  });

  const securities: Security[] = [];
  const pools = new Map<number, PoolState>();

  securities.push(
    // The REAL Treasury universe, from the committed auction snapshot. Its
    // size is what Treasury has issued, not a scale knob — the on-the-run
    // ladder has one issue per tenor because that is how many there are.
    ...buildTreasuriesFromReference({ asOf, includeStrips: true, startSecurityId: 0 }),
  );
  securities.push(
    ...buildAgencyDebentures({ asOf, seed, startSecurityId: 20_000, benchmarkYield: historicalYield, perIssuer: 10 }),
  );
  securities.push(
    ...buildCreditBonds({ issuers, asOf, seed, startSecurityId: 40_000, benchmarkYield: historicalYield }),
  );
  securities.push(...buildMuniDeals({ asOf, seed, startSecurityId: 200_000, scaleYield, dealCount: scale.muniDeals }).securities);

  for (const record of buildMbsPools({
    asOf, calendar, seed, startSecurityId: 300_000, poolsPerCohortCoupon: scale.mbsPoolsPerCoupon,
  })) {
    securities.push(record.security);
    pools.set(record.security.securityId, record.pool);
  }

  securities.push(...buildCmbsDeals({ asOf, seed, startSecurityId: 400_000, dealCount: scale.cmbsDeals }).securities);
  securities.push(...buildAbsDeals({ asOf, seed, startSecurityId: 600_000, dealsPerSector: scale.absDealsPerSector }).securities);
  securities.push(...buildCloDeals({ asOf, seed, startSecurityId: 500_000, dealCount: scale.cloDeals }).securities);

  // Single-name CDS, keyed to the issuers that already have bonds outstanding.
  // Sharing `issuerId` is what turns the bond-CDS basis into a join rather than
  // a name match, so only names with cash bonds get a curve.
  const referenceObligations = new Map<number, string>();
  const issuersWithBonds = new Set<number>();
  for (const security of securities) {
    if (security.assetClass !== 'CorpIG' && security.assetClass !== 'CorpHY') continue;
    issuersWithBonds.add(security.issuerId);
    if (!referenceObligations.has(security.issuerId)) {
      referenceObligations.set(security.issuerId, security.cusip);
    }
  }
  const cdsEntities = entitiesWithBonds(
    buildCdsEntities({ issuers, seed, referenceObligations }),
    issuersWithBonds,
  );
  securities.push(...buildCdsSecurities({
    entities: cdsEntities.slice(0, Math.max(1, Math.round(cdsEntities.length * scale.cdsCoverage))),
    asOf, seed, startSecurityId: 700_000, contractsPerEntity: 2,
  }));
  // Indices. The instrument a desk moves credit risk in size with — a broad
  // book cannot be hedged with single names at any realistic per-name limit.
  securities.push(...buildCdsIndexSecurities(
    buildCdsIndices({ asOf, entities: cdsEntities, historyPerFamily: 2 }), 750_000,
  ));

  return { securities, issuers, pools };
}

export function buildBook(options: BookOptions): BuiltBook {
  const scale = options.scale ?? DEMO_SCALE;
  const { asOf, calendar, seed } = options;

  // A first-pass curve, used only to set coupons at issue. The real curve
  // comes from the factor engine once the universe exists.
  const seedCurve = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });
  const historicalYield = (date: DateInt, tenor: number): number => {
    const yearsAgo = Math.max(0, Math.trunc(asOf / 10000) - Math.trunc(date / 10000));
    return Math.max(0.5, seedCurve.parYield(Math.max(0.25, tenor), 2) - yearsAgo * 0.42);
  };
  const scaleYield = (tenor: number): number => seedCurve.parYield(Math.max(1, tenor), 2) * 0.72;

  const { securities, issuers, pools } = buildUniverse(options, scale, historicalYield, scaleYield);

  const engine = new FactorEngine({
    seed,
    calendar,
    sectorOfIssuer: sectorVector(issuers),
    initialRatings: ratingVector(issuers),
  });
  // Walk the factors off their resting point so the book does not start with
  // every spread sitting exactly on its long-run mean.
  let state = engine.seedState(asOf);
  for (let i = 0; i < 20; i++) state = engine.step(state, addYears(asOf, -1) + i).state;
  state = { ...state, asOf };

  const issuerById = new Map(issuers.map((issuer) => [issuer.issuerId, issuer]));
  const mortgage = seedMortgageRates();
  const curve = engine.curve(state);

  const holdings: Holding[] = [];
  const rng = createRng(deriveSeed(seed, 'holdings'));
  let positionSeq = 1;

  for (const security of securities) {
    if (security.maturityDate <= asOf) continue;
    if (rng() > scale.heldFraction) continue;

    const issuer = issuerById.get(security.issuerId);
    const spreadBp = spreadForSecurity(security, issuer, state, engine);
    const pool = pools.get(security.securityId);
    const ctx: ValuationContext = {
      asOf, calendar, curve, mortgage, spreadBp, withKeyRates: true,
      ...(pool === undefined ? {} : { pool }),
    };
    const priced = priceSecurity(security, ctx);
    if (!Number.isFinite(priced.cleanPrice) || priced.cleanPrice <= 0) continue;

    const positionId = `POS-${String(positionSeq++).padStart(7, '0')}`;
    const lotRng = createRng(deriveSeed(seed, 'lots', security.securityId));
    const lots = seedLots(positionId, security, calendar, asOf, priced.yieldToMaturity, lotRng);
    if (lots.length === 0) continue;

    holdings.push({ positionId, security, priced, lots, spreadBp, ...(pool === undefined ? {} : { pool }) });
  }

  // A deterministic build stamp, so two builds of the same seed are equal.
  // The live path overwrites it with the wall clock on the first tick.
  const buildStamp = asOf * 1000;
  const rows = holdings.map((holding) =>
    toRow(holding, calendar, asOf, holding.priced.cleanPrice, buildStamp));
  const riskVectors = holdings.map((holding, i) => toRiskVector(holding, issuerById, rows[i] as PositionRow));
  // Revaluation is always measured from the BUILD state, never chained off the
  // last tick. Chaining compounds `price *= (1 + r)`, which is not reversible:
  // a 50 bp move out and back leaves a residual, and a scenario's answer would
  // then depend on how many intermediate days it stepped through rather than
  // on where it ended up. Pricing from the base makes `repriceFast` a pure
  // function of the state handed to it.
  const baseState = state;

  return {
    asOf,
    securities,
    issuers,
    positions: rows,
    engine,
    state,
    riskVectors,
    step: (date: DateInt): FactorState => {
      state = engine.step(state, date).state;
      return state;
    },
    spreadFor: (security: Security): number =>
      spreadForSecurity(security, issuerById.get(security.issuerId), state, engine),
    repriceFast: (next: FactorState): PositionRow[] => {
      repriceInPlace(rows, riskVectors, baseState, next);
      return rows;
    },
  };
}

function toRow(
  holding: Holding, calendar: Calendar, asOf: DateInt, previousMid: number, timestamp: number,
): PositionRow {
  const terms = holding.security.assetClass === 'CDS' ? null : termsFor(holding.security, calendar);
  const basisAt = (lot: Lot): number =>
    terms === null ? lot.purchasePriceClean : amortizedCost(lot, terms, asOf);

  return buildPositionRow({
    positionId: holding.positionId,
    security: holding.security,
    priced: holding.priced,
    lots: holding.lots,
    desk: deskFor(holding.security),
    asOf,
    basisAt,
    previousMid,
    timestamp,
    ...(holding.pool === undefined ? {} : { poolFactor: holding.pool.factor }),
  });
}

function toRiskVector(holding: Holding, issuerById: Map<number, Issuer>, row: PositionRow): RiskVector {
  const face = holding.lots.reduce((sum, lot) => sum + lot.remainingFace, 0);
  const issuer = issuerById.get(holding.security.issuerId);
  const currentFace = face * (holding.pool?.factor ?? 1);
  return {
    positionId: holding.positionId,
    securityId: holding.security.securityId,
    beta: holding.priced.betaSensitivity,
    spreadDuration: holding.priced.spreadDuration,
    convexity: holding.priced.convexity,
    creditBeta: issuer === undefined ? 0 : issuer.isHighYield ? 1.35 : 1,
    currentFace,
    basePrice: holding.priced.cleanPrice,
    issuerId: holding.security.issuerId,
    costBasis: (((row.avgCost as number) - (holding.security.assetClass === 'CDS' ? 100 : 0)) / 100) * currentFace,
    isSwap: holding.security.assetClass === 'CDS',
    accruedCash: row.accruedInterest as number,
    duration: holding.priced.modifiedDuration,
    spreadLevelPct: Math.max(0, row.zSpread as number) / 100,
    baseYtm: row.yieldToMaturity as number,
    baseYtw: row.yieldToWorst as number,
    baseZSpread: row.zSpread as number,
    baseOas: row.oas as number,
    halfSpreadPoints: halfSpreadPoints(holding.security, holding.priced.modifiedDuration),
    quotationBasis: holding.security.quotationBasis,
  };
}

/**
 * Revalue the whole book against a factor state, in place.
 *
 * `dy = B . dBeta` is exact for the curve leg because the NSS decay parameters
 * are frozen; the spread leg and the convexity term are second-order. Only the
 * dozen fields a price move actually touches are rewritten — the lot rollup,
 * the amortised basis and the terms do not change intraday, and recomputing
 * them is what turns a microsecond into a millisecond.
 *
 * `base` is the state the book was BUILT and fully priced at, not the previous
 * tick. Every call therefore lands on the same price for the same state, in any
 * order, however many times it is called.
 */
function repriceInPlace(
  rows: PositionRow[],
  vectors: readonly RiskVector[],
  base: FactorState,
  next: FactorState,
): void {
  const d0 = next.betas.b0 - base.betas.b0;
  const d1 = next.betas.b1 - base.betas.b1;
  const d2 = next.betas.b2 - base.betas.b2;
  const d3 = next.betas.b3 - base.betas.b3;
  const dCredit = next.credit.systematic - base.credit.systematic;
  const now = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const vector = vectors[i] as RiskVector;
    const row = rows[i] as PositionRow;

    // `dy` is the DURATION-WEIGHTED yield move, `sum KRD_k * dy_k`, which is
    // already the first-order price effect in percent. The convexity term needs
    // the yield move itself, so divide it back out. The right divisor is
    // `beta[0]`, which IS the effective duration: the level factor's NSS loading
    // is 1 at every tenor, so `beta[0] = sum KRD_k`, and the key rates partition
    // unity. Dividing by the analytic MODIFIED duration instead would be wrong
    // by `1 + y/2`. Squaring the weighted move without dividing at all would be
    // wrong by D-squared, a factor of 850 on a 30-year strip.
    const dy = vector.beta[0] * d0 + vector.beta[1] * d1 + vector.beta[2] * d2 + vector.beta[3] * d3;
    // MAGNITUDE, not sign: a deep-premium mortgage pool and a bought CDS
    // protection leg both carry NEGATIVE effective duration, and a `> 0.05`
    // guard drops them into the fallback branch where the convexity term is
    // scaled by D-squared all over again.
    const ownYieldMove = (Math.abs(vector.beta[0]) > 0.05 ? dy / vector.beta[0] : dy) / 100;
    // The credit factor moves in LOG space, so it is a RELATIVE widening. A 2%
    // widening is 3 bp on a 150 bp bond and 12 bp on a 600 bp one; it has to be
    // applied to the position's own spread level, not treated as an absolute.
    const dSpreadPct = vector.spreadDuration * vector.creditBeta * vector.spreadLevelPct * dCredit;
    const previousMid = row.midPrice;
    const relative = -dy / 100 + 0.5 * vector.convexity * ownYieldMove * ownYieldMove - dSpreadPct / 100;
    const mid = Math.max(0.01, vector.basePrice * (1 + relative));
    const marketValue = ((vector.isSwap ? mid - 100 : mid) / 100) * vector.currentFace;

    row.midPrice = mid;
    row.cleanPrice = mid;
    row.dirtyPrice = mid + (vector.accruedCash / Math.max(1, vector.currentFace)) * 100;
    row.bidPrice = mid - vector.halfSpreadPoints;
    row.askPrice = mid + vector.halfSpreadPoints;
    row.quotedPrice = formatPrice(mid, vector.quotationBasis);
    row.priceChange = mid - previousMid;
    row.priceChangePct = previousMid === 0 ? 0 : ((mid - previousMid) / previousMid) * 100;
    row.yieldToMaturity = vector.baseYtm + ownYieldMove * 100;
    row.yieldToWorst = vector.baseYtw + ownYieldMove * 100;
    const spreadWidenBp = vector.spreadLevelPct * vector.creditBeta * dCredit * 100;
    row.zSpread = vector.baseZSpread + spreadWidenBp;
    row.oas = vector.baseOas + spreadWidenBp;
    row.marketValue = marketValue;
    row.unrealizedPnL = marketValue - vector.costBasis;
    row.dailyPnL = (row.dailyPnL as number) + ((mid - previousMid) / 100) * vector.currentFace;
    row.dv01 = (vector.duration * marketValue) / 10000;
    row.lastUpdate = now;
  }
}
