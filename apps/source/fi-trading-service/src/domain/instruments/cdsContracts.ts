/**
 * CDS contract dates and index construction.
 *
 * Two conventions do most of the work.
 *
 * **IMM dates.** Every contract matures on the 20th of March, June, September
 * or December, UNADJUSTED — a maturity does not roll off a weekend even though
 * payments do. Every trade struck between two IMM dates shares a maturity,
 * which is what makes the market fungible enough to clear.
 *
 * **Index rolls.** A new series comes twice a year, on 20 March and 20
 * September, with an extended maturity and refreshed constituents. The old
 * series keeps trading with visibly worse liquidity, so a book holds an
 * on-the-run series and a tail of off-the-runs — the same shape as the
 * Treasury ladder, for the same reason.
 *
 * Index constituents are a STRICT SUBSET of the corporate issuers, so the
 * index level really is the weighted intrinsic of its single names, and an
 * index selloff moves every constituent bond and CDS at once.
 */

import { addYears, dayOf, monthOf, toDateInt, yearOf, type DateInt } from '../core/dateInt.js';
import type { CdsEntity } from './cdsEntities.js';

export type CdsTenor = '1Y' | '3Y' | '5Y' | '7Y' | '10Y';

export const CDS_TENORS: readonly CdsTenor[] = ['1Y', '3Y', '5Y', '7Y', '10Y'];

export function tenorYears(tenor: CdsTenor): number {
  return Number(tenor.replace('Y', ''));
}

/** The four IMM months. */
const IMM_MONTHS = [3, 6, 9, 12] as const;
const IMM_DAY = 20;

export function isImmDate(date: DateInt): boolean {
  return dayOf(date) === IMM_DAY && (IMM_MONTHS as readonly number[]).includes(monthOf(date));
}

/** The first IMM date strictly after `date`. */
export function nextImmDate(date: DateInt): DateInt {
  const year = yearOf(date);
  for (const month of IMM_MONTHS) {
    const candidate = toDateInt(year, month, IMM_DAY);
    if (candidate > date) return candidate;
  }
  return toDateInt(year + 1, IMM_MONTHS[0], IMM_DAY);
}

/** The most recent IMM date on or before `date`. Premium accrues from here. */
export function previousImmDate(date: DateInt): DateInt {
  const year = yearOf(date);
  for (let i = IMM_MONTHS.length - 1; i >= 0; i--) {
    const candidate = toDateInt(year, IMM_MONTHS[i] as number, IMM_DAY);
    if (candidate <= date) return candidate;
  }
  return toDateInt(year - 1, IMM_MONTHS[IMM_MONTHS.length - 1] as number, IMM_DAY);
}

/**
 * Standard maturity for a tenor.
 *
 * Rolls to the next IMM date first, then adds the tenor — which is why every
 * trade struck in a quarter shares one maturity.
 */
export function standardMaturity(tradeDate: DateInt, tenor: CdsTenor): DateInt {
  return addYears(nextImmDate(tradeDate), tenorYears(tenor));
}

/** Protection starts the day after the trade. */
export function protectionStart(tradeDate: DateInt): DateInt {
  return previousImmDate(tradeDate);
}

/** Days of coupon accrued since the previous roll, ACT/360. */
export function daysSincePreviousImm(tradeDate: DateInt): number {
  const previous = previousImmDate(tradeDate);
  const toSerial = (d: DateInt): number =>
    Math.floor(yearOf(d) * 365.25) + monthOf(d) * 30 + dayOf(d);
  return Math.max(0, toSerial(tradeDate) - toSerial(previous));
}

export type IndexFamily = 'CDX.NA.IG' | 'CDX.NA.HY' | 'CDX.EM' | 'iTraxx Europe' | 'iTraxx Crossover';

export interface CdsIndexDefinition {
  family: IndexFamily;
  constituentCount: number;
  couponBp: 100 | 500;
  /** How CDX.HY quotes: in price, not spread. */
  quotesInPrice: boolean;
  highYield: boolean;
}

export const INDEX_DEFINITIONS: readonly CdsIndexDefinition[] = [
  { family: 'CDX.NA.IG', constituentCount: 125, couponBp: 100, quotesInPrice: false, highYield: false },
  { family: 'CDX.NA.HY', constituentCount: 100, couponBp: 500, quotesInPrice: true, highYield: true },
  { family: 'CDX.EM', constituentCount: 40, couponBp: 100, quotesInPrice: false, highYield: false },
  { family: 'iTraxx Europe', constituentCount: 125, couponBp: 100, quotesInPrice: false, highYield: false },
  { family: 'iTraxx Crossover', constituentCount: 75, couponBp: 500, quotesInPrice: true, highYield: true },
];

export interface CdsIndex {
  family: IndexFamily;
  series: number;
  version: number;
  /** Issuer ids in the index. A strict subset of the corporate universe. */
  constituentIssuerIds: number[];
  couponBp: 100 | 500;
  /** Falls below one as constituents default. */
  indexFactor: number;
  maturity: DateInt;
  rollDate: DateInt;
  onTheRun: boolean;
  quotesInPrice: boolean;
}

/** Series roll on 20 March and 20 September. */
export function seriesRollDates(year: number): [DateInt, DateInt] {
  return [toDateInt(year, 3, IMM_DAY), toDateInt(year, 9, IMM_DAY)];
}

/** Series number as of a date, anchored so it advances twice a year. */
export function seriesNumber(asOf: DateInt, baseSeries = 45, baseYear = 2026): number {
  const years = yearOf(asOf) - baseYear;
  const [march, september] = seriesRollDates(yearOf(asOf));
  let withinYear = 0;
  if (asOf >= september) withinYear = 2;
  else if (asOf >= march) withinYear = 1;
  return baseSeries + years * 2 + withinYear;
}

export interface CdsIndexOptions {
  asOf: DateInt;
  entities: readonly CdsEntity[];
  /** Off-the-run series to keep alongside the current one. */
  historyPerFamily?: number;
}

/**
 * Build the index universe.
 *
 * Constituents are drawn from the entity set by credit quality, so an index
 * and its members cannot disagree about what the index contains.
 */
export function buildCdsIndices(options: CdsIndexOptions): CdsIndex[] {
  const history = options.historyPerFamily ?? 3;
  const current = seriesNumber(options.asOf);
  const out: CdsIndex[] = [];

  for (const definition of INDEX_DEFINITIONS) {
    const pool = options.entities.filter((entity) => entity.isHighYield === definition.highYield);
    for (let back = 0; back < history; back++) {
      const series = current - back;
      // Rotate the window so successive series differ in a few names, the way
      // a real roll replaces the constituents that no longer qualify.
      const offset = (back * 7) % Math.max(1, pool.length);
      const constituents: number[] = [];
      for (let i = 0; i < definition.constituentCount && i < pool.length; i++) {
        constituents.push((pool[(offset + i) % pool.length] as CdsEntity).issuerId);
      }
      const rollDate = toDateInt(
        yearOf(options.asOf) - Math.floor(back / 2),
        back % 2 === 0 ? 3 : 9,
        IMM_DAY,
      );
      out.push({
        family: definition.family,
        series,
        version: 1,
        constituentIssuerIds: constituents,
        couponBp: definition.couponBp,
        indexFactor: 1,
        maturity: addYears(rollDate, 5),
        rollDate,
        onTheRun: back === 0,
        quotesInPrice: definition.quotesInPrice,
      });
    }
  }
  return out;
}

/**
 * Weighted intrinsic spread of an index, in basis points.
 *
 * The traded index differs from this by the SKEW — a real and persistently
 * discussed gap, and one that is impossible to produce if the index level is
 * drawn independently of its constituents.
 */
export function intrinsicSpreadBp(
  index: CdsIndex,
  spreadByIssuer: ReadonlyMap<number, number>,
): number {
  let total = 0;
  let counted = 0;
  for (const issuerId of index.constituentIssuerIds) {
    const spread = spreadByIssuer.get(issuerId);
    if (spread === undefined) continue;
    total += spread;
    counted += 1;
  }
  return counted === 0 ? 0 : total / counted;
}

/** Index factor after `defaults` constituents have been removed. */
export function indexFactorAfterDefaults(originalCount: number, defaults: number): number {
  if (originalCount <= 0) return 0;
  return Math.max(0, (originalCount - defaults) / originalCount);
}
