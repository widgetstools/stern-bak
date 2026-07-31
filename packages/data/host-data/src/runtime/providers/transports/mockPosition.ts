/**
 * mockPosition — builds 250+ field position rows from a universe entry.
 *
 * Two functions:
 *   - `buildPosition(u, accountIdx)` mints a fresh position with stable
 *     reference data + opening pricing/risk derived from the universe
 *     anchor.
 *   - `tickPosition(row)` advances pricing, yields, spreads, P&L,
 *     and timestamps by a small random walk. Returns a NEW row object
 *     so consumers comparing by reference detect the change.
 *
 * Fields are grouped into helper functions and spread together; this
 * keeps the file under the 800-LOC ceiling while making it easy to
 * extend a single category.
 */

import type { UniverseEntry } from './mockUniverse.js';

export interface PositionRow extends Record<string, unknown> {
  id: string;
  cusip: string;
  // hot-path fields surfaced for the tick fn; everything else is
  // dynamically added via field-group spreads.
  bidPrice: number;
  askPrice: number;
  midPrice: number;
  lastPrice: number;
  yieldToMaturity: number;
  oas: number;
  quantityFace: number;
  marketValue: number;
  avgCost: number;
  accruedInterest: number;
  factor: number;
  dailyPnL: number;
  unrealizedPnL: number;
  lastUpdate: number;
}

const ACCOUNTS = [
  { id: 'ACCT-001', name: 'Core IG Fund', strategy: 'Core IG',         pm: 'A. Tan',     desk: 'IG',   book: 'IG-Core',     region: 'Americas' },
  { id: 'ACCT-002', name: 'HY Opportunity', strategy: 'HY Opportunity', pm: 'B. Patel',   desk: 'HY',   book: 'HY-Opp',      region: 'Americas' },
  { id: 'ACCT-003', name: 'Govt Plus',      strategy: 'Govt+',          pm: 'C. Liu',     desk: 'Rates',book: 'Rates-Curve', region: 'Americas' },
  { id: 'ACCT-004', name: 'Securitized',    strategy: 'Sec Beta',       pm: 'D. Singh',   desk: 'Sec',  book: 'Sec-Beta',    region: 'Americas' },
  { id: 'ACCT-005', name: 'Muni Tax-Free',  strategy: 'Muni TE',        pm: 'E. Ramirez', desk: 'Muni', book: 'Muni-TE',     region: 'Americas' },
];

function jitter(base: number, pctRange: number): number {
  return base * (1 + (Math.random() - 0.5) * pctRange);
}
function round(n: number, dp: number): number { return Number(n.toFixed(dp)); }
function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }

function identifierFields(u: UniverseEntry, posIdx: number) {
  return {
    id: `POS-${u.cusip}-${posIdx}`,
    positionKey: `${u.cusip}-${posIdx}`,
    cusip: u.cusip,
    isin: u.isin,
    sedol: u.sedol,
    ticker: u.ticker,
    figi: u.figi,
    internalId: u.internalId,
  };
}

function issuerFields(u: UniverseEntry) {
  return {
    issuerName: u.issuerName,
    issuerLei: u.issuerLei,
    issuerCountry: u.issuerCountry,
    issuerCountryCode: u.issuerCountryCode,
    issuerSector: u.issuerSector,
    issuerSubSector: u.issuerSubSector,
    issuerIndustryGroup: u.issuerIndustryGroup,
    parentIssuer: u.parentIssuer,
    guarantor: u.guarantor,
    ultimateParent: u.ultimateParent,
    issuerType: u.issuerType,
    esgScore: u.esgScore,
  };
}

function instrumentCoreFields(u: UniverseEntry) {
  return {
    securityType: u.securityType,
    securitySubType: u.securitySubType,
    assetClass: u.assetClass,
    assetSubClass: u.securitySubType,
    currency: u.currency,
    issueDate: u.issueDate,
    firstSettleDate: u.firstSettleDate,
    maturityDate: u.maturityDate,
    originalMaturity: u.originalMaturityYears,
    workoutDate: u.workoutDate,
    workoutPrice: u.workoutPrice,
    seniority: u.seniority,
    instrumentDescription: `${u.issuerName} ${u.couponRate.toFixed(3)}% ${u.maturityDate}`,
    cfiCode: u.cfiCode,
    micCode: u.micCode,
    exchange: u.exchange,
    listingStatus: u.listingStatus,
    trancheId: u.trancheId,
  };
}

function couponFields(u: UniverseEntry) {
  const today = new Date();
  const next = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());
  return {
    couponType: u.couponType,
    couponRate: u.couponRate,
    couponFrequency: u.couponFrequency,
    dayCount: u.dayCount,
    accrualBasis: u.accrualBasis,
    businessDayConvention: u.businessDayConvention,
    paymentDelay: 0,
    interestAccrualMethod: 'ActualActual',
    firstCouponDate: u.firstSettleDate,
    nextCouponDate: next.toISOString().slice(0, 10),
    lastCouponDate: u.issueDate,
    exDivDays: 7,
  };
}

function callPutSinkFields(u: UniverseEntry) {
  return {
    callable: u.callable,
    puttable: u.puttable,
    sinkable: u.sinkable,
    convertible: u.convertible,
    nextCallDate: u.nextCallDate,
    nextCallPrice: u.nextCallPrice,
    nextPutDate: u.nextPutDate,
    nextPutPrice: u.nextPutPrice,
    callSchedule: u.callSchedule,
    sinkSchedule: u.sinkSchedule,
  };
}

function pricingFields(u: UniverseEntry, mid: number, midYld: number, spreadBps: number) {
  const halfSpread = u.assetClass === 'Rates' ? 0.02 : u.assetClass === 'CorpHY' ? 0.35 : 0.08;
  const bid = round(mid - halfSpread, 4);
  const ask = round(mid + halfSpread, 4);
  const last = round(mid + (Math.random() - 0.5) * halfSpread * 0.4, 4);
  const yldHalfBps = u.assetClass === 'Rates' ? 0.5 : 3;
  const now = Date.now();
  return {
    bidPrice: bid,
    askPrice: ask,
    midPrice: round(mid, 4),
    lastPrice: last,
    evalPrice: round(mid + (Math.random() - 0.5) * 0.02, 4),
    closePrice: round(mid - 0.03, 4),
    openPrice: round(mid + 0.04, 4),
    highPrice: round(mid + 0.12, 4),
    lowPrice: round(mid - 0.15, 4),
    priceDate: new Date(now).toISOString().slice(0, 10),
    priceTime: new Date(now).toISOString(),
    priceSource: u.assetClass === 'Muni' ? 'IDC' : 'BVAL',
    priceQuality: 'Live',
    bidYield: round(midYld + yldHalfBps / 100, 4),
    askYield: round(midYld - yldHalfBps / 100, 4),
    midYield: round(midYld, 4),
    bidSize: 1_000_000 * (1 + Math.floor(Math.random() * 5)),
    askSize: 1_000_000 * (1 + Math.floor(Math.random() * 5)),
    bidSpread: round(spreadBps + 0.5, 2),
    askSpread: round(spreadBps - 0.5, 2),
    quotedSpread: round(spreadBps, 2),
    priceChange: 0,
    priceChangePct: 0,
    yieldChange: 0,
    quoteCount24h: 50 + Math.floor(Math.random() * 200),
  };
}

function yieldFields(u: UniverseEntry, midYld: number, spreadBps: number) {
  return {
    yieldToMaturity: round(midYld, 4),
    yieldToWorst: round(midYld - 0.05, 4),
    yieldToCall: u.callable ? round(midYld - 0.12, 4) : null,
    yieldToPut: u.puttable ? round(midYld + 0.18, 4) : null,
    currentYield: round((u.couponRate * 100) / Math.max(50, 100), 4),
    bondEquivalentYield: round(midYld, 4),
    discountMargin: u.couponType === 'Floating' ? round(spreadBps, 2) : null,
    zSpread: round(spreadBps + 4, 2),
  };
}

function spreadFields(u: UniverseEntry, spreadBps: number) {
  return {
    iSpread: round(spreadBps + 2, 2),
    assetSwapSpread: round(spreadBps + 1, 2),
    gSpread: round(spreadBps + 3, 2),
    oas: round(spreadBps - 1, 2),
    nominalSpread: round(spreadBps, 2),
    cdsLevel: u.assetClass === 'CorpIG' || u.assetClass === 'CorpHY' ? round(spreadBps + 8, 2) : null,
    benchmark: u.benchmark,
    benchmarkPrice: 100,
    benchmarkYield: round(u.anchorYield - u.anchorSpreadBps / 100, 4),
    benchmarkSpreadBps: round(spreadBps, 2),
    benchmarkTenor: u.benchmarkTenor,
    swapSpread: u.assetClass === 'CorpIG' || u.assetClass === 'CorpHY' ? round(spreadBps - 4, 2) : null,
  };
}

function riskFields(u: UniverseEntry) {
  const ttm = u.originalMaturityYears;
  const dur = Math.max(0.25, ttm * 0.85);
  const krd = {
    '1Y':  round(dur * 0.05, 4),
    '2Y':  round(dur * 0.10, 4),
    '5Y':  round(dur * 0.25, 4),
    '10Y': round(dur * 0.40, 4),
    '30Y': round(dur * 0.20, 4),
  };
  return {
    modifiedDuration: round(dur, 4),
    macaulayDuration: round(dur * 1.02, 4),
    effectiveDuration: round(dur * 0.98, 4),
    spreadDuration: round(dur * 0.95, 4),
    oad: round(dur * 0.97, 4),
    oac: round(Math.pow(dur, 2) * 0.012, 4),
    convexity: round(Math.pow(dur, 2) * 0.014, 4),
    effectiveConvexity: round(Math.pow(dur, 2) * 0.013, 4),
    dv01: round((dur * 100) / 10000, 6),
    pv01: round((dur * 100) / 10000, 6),
    cs01: u.assetClass === 'Rates' ? 0 : round((dur * 100) / 11000, 6),
    ir01: round((dur * 100) / 10500, 6),
    theta: round(u.couponRate / 365, 6),
    ttmYears: round(ttm, 4),
    keyRateDurations: krd,
    krd1Y: krd['1Y'],
    krd2Y: krd['2Y'],
    krd5Y: krd['5Y'],
    krd10Y: krd['10Y'],
    krd30Y: krd['30Y'],
  };
}

function creditFields(u: UniverseEntry) {
  const pd = u.ratingsBucket === 'HY' ? 0.045
    : u.ratingsBucket === 'IG' ? 0.0035
    : 0.0001;
  return {
    compositeRating: u.compositeRating,
    ratingsBucket: u.ratingsBucket,
    impliedRating: u.compositeRating,
    ratingDate: u.issueDate,
    ratingOutlook: u.moodysOutlook,
    watchStatus: 'None',
    probabilityOfDefault: pd,
    lossGivenDefault: 0.6,
    recoveryRate: 0.4,
    distanceToDefault: u.ratingsBucket === 'HY' ? 2.1 : 6.8,
    ratings: {
      moodys: { rating: u.moodysRating, outlook: u.moodysOutlook, date: u.issueDate },
      sp:     { rating: u.spRating,     outlook: u.spOutlook,     date: u.issueDate },
      fitch:  { rating: u.fitchRating,  outlook: u.fitchOutlook,  date: u.issueDate },
      dbrs:   { rating: u.dbrsRating,   outlook: 'Stable',        date: u.issueDate },
    },
    moodysRating: u.moodysRating,
    moodysOutlook: u.moodysOutlook,
    spRating: u.spRating,
    spOutlook: u.spOutlook,
    fitchRating: u.fitchRating,
    fitchOutlook: u.fitchOutlook,
    dbrsRating: u.dbrsRating,
  };
}

function mbsFields(u: UniverseEntry) {
  const isMbs = u.assetClass === 'AgencyMBS' || u.assetClass === 'CMBS' || u.assetClass === 'RMBS';
  return {
    poolNumber: u.poolNumber,
    agency: u.agency,
    mbsType: u.mbsType,
    wac: u.wac,
    wam: u.wam,
    wala: u.wala,
    avgLoanSize: u.avgLoanSize,
    avgFico: u.avgFico,
    avgLtv: u.avgLtv,
    avgDti: u.avgDti,
    cprModeled: isMbs ? round(8 + Math.random() * 4, 2) : null,
    cprActual1M: isMbs ? round(7 + Math.random() * 4, 2) : null,
    cprActual3M: isMbs ? round(7.5 + Math.random() * 3, 2) : null,
    psa: isMbs ? Math.floor(120 + Math.random() * 60) : null,
    loanCount: u.loanCount,
    delinquency30: isMbs ? round(0.5 + Math.random() * 0.8, 2) : null,
    delinquency60: isMbs ? round(0.2 + Math.random() * 0.4, 2) : null,
    delinquency90: isMbs ? round(0.1 + Math.random() * 0.3, 2) : null,
    foreclosureRate: isMbs ? round(0.05 + Math.random() * 0.15, 3) : null,
    reoRate: isMbs ? round(0.02 + Math.random() * 0.06, 3) : null,
  };
}

function muniFields(u: UniverseEntry) {
  return {
    state: u.state,
    muniSector: u.muniSector,
    federalTaxStatus: u.federalTaxStatus,
    stateTaxStatus: u.stateTaxStatus,
    insured: u.insured,
    insurer: u.insurer,
    useOfProceeds: u.useOfProceeds,
    preRefunded: u.preRefunded,
  };
}

function floaterFields(u: UniverseEntry) {
  return {
    floater: u.couponType === 'Floating',
    referenceRate: u.referenceRate,
    floatSpreadBps: u.floatSpreadBps,
    floatCap: u.floatCap,
    floatFloor: u.floatFloor,
    resetFrequency: u.resetFrequency,
    nextResetDate: null,
    lookbackDays: null,
  };
}

function convertibleFields(u: UniverseEntry, mid: number) {
  const isConv = u.assetClass === 'Convertible';
  return {
    conversionRatio: u.conversionRatio,
    conversionPrice: u.conversionPrice,
    conversionPremium: isConv ? round((mid / 100 - 1) * 100, 4) : null,
    parityValue: isConv && u.conversionRatio && u.issuerStockPrice ? round(u.conversionRatio * u.issuerStockPrice, 4) : null,
    investmentValue: isConv ? round(mid * 0.85, 4) : null,
    underlyingTicker: u.underlyingTicker,
  };
}

function positionPnLFields(u: UniverseEntry, qtyFace: number, factor: number, mid: number, accrued: number, avgCost: number) {
  const currentFace = qtyFace * factor;
  const cleanMv = (mid / 100) * currentFace;
  const dirtyMv = cleanMv + accrued;
  const bookValue = (avgCost / 100) * currentFace;
  const unrealized = round(cleanMv - bookValue, 2);
  return {
    quantityFace: qtyFace,
    originalFace: qtyFace,
    factor: round(factor, 6),
    currentFace: round(currentFace, 2),
    cleanPrice: round(mid, 4),
    dirtyPrice: round(mid + (accrued / currentFace) * 100, 4),
    accruedInterest: round(accrued, 2),
    marketValue: round(dirtyMv, 2),
    bookValue: round(bookValue, 2),
    amortizedCost: round(bookValue, 2),
    avgCost: round(avgCost, 4),
    unrealizedPnL: unrealized,
    realizedPnL: 0,
    dailyPnL: 0,
    mtdPnL: round(unrealized * 0.12, 2),
    ytdPnL: round(unrealized * 0.46, 2),
    inceptionPnL: unrealized,
  };
}

function accountAndDeskFields(u: UniverseEntry, posIdx: number, openDateIso: string) {
  const acc = ACCOUNTS[posIdx % ACCOUNTS.length];
  const daysHeld = Math.floor((Date.now() - new Date(openDateIso).getTime()) / 86400000);
  return {
    accountId: acc.id,
    accountName: acc.name,
    portfolio: acc.name,
    strategy: acc.strategy,
    desk: acc.desk,
    book: acc.book,
    trader: 'T. Wong',
    pm: acc.pm,
    analyst: 'L. Chen',
    region: acc.region,
    positionStatus: 'Open',
    openDate: openDateIso,
    daysHeld,
    side: 'Long',
    restricted: false,
  };
}

function complianceAndLimitsFields(u: UniverseEntry) {
  return {
    complianceStatus: 'Approved',
    concentrationLimit: 5.0,
    concentrationUsed: round(0.3 + Math.random() * 1.5, 3),
    concentrationPctUsed: round(6 + Math.random() * 30, 2),
    haircut: u.assetClass === 'Rates' ? 0.02 : u.assetClass === 'CorpHY' ? 0.15 : 0.05,
    collateralEligible: u.assetClass === 'Rates' || u.assetClass === 'Agency',
    repoEligible: u.assetClass === 'Rates' || u.assetClass === 'Agency' || u.assetClass === 'AgencyMBS',
    lendingEligible: true,
  };
}

function exposureFields(u: UniverseEntry, dur: number, spreadBps: number, mvPct: number) {
  const matBucket = u.originalMaturityYears < 3 ? '0-3Y'
    : u.originalMaturityYears < 7 ? '3-7Y'
    : u.originalMaturityYears < 15 ? '7-15Y'
    : '15Y+';
  return {
    exposureByMaturity: { bucket: matBucket, weight: mvPct },
    exposureByRating: { bucket: u.ratingsBucket, weight: mvPct },
    exposureBySector: { sector: u.issuerSector, weight: mvPct },
    weightInPortfolio: round(mvPct, 4),
    activeWeight: round(mvPct - 0.5, 4),
    benchmarkWeight: 0.5,
    contributionToDuration: round(dur * mvPct / 100, 6),
    contributionToSpreadDuration: round(dur * mvPct / 100 * 0.95, 6),
    contributionToYield: round(u.anchorYield * mvPct / 100, 6),
    contributionToPnL: 0,
  };
}

function liquidityFields(u: UniverseEntry) {
  const tier = u.assetClass === 'Rates' ? 'L1'
    : u.assetClass === 'Agency' || u.assetClass === 'AgencyMBS' ? 'L2'
    : u.assetClass === 'CorpIG' ? 'L2'
    : u.assetClass === 'CMBS' || u.assetClass === 'RMBS' ? 'L3'
    : u.assetClass === 'CorpHY' ? 'L3'
    : 'L4';
  return {
    avgDailyVolume30d: u.assetClass === 'Rates' ? 1.5e9 : u.assetClass === 'CorpIG' ? 35e6 : 8e6,
    tradingVolumeMtd: u.assetClass === 'Rates' ? 28e9 : u.assetClass === 'CorpIG' ? 600e6 : 90e6,
    liquidityScore: round(tier === 'L1' ? 9.6 : tier === 'L2' ? 7.4 : tier === 'L3' ? 4.8 : 2.2, 2),
    liquidityTier: tier,
    bidAskBps: u.assetClass === 'Rates' ? 1 : u.assetClass === 'CorpIG' ? 8 : u.assetClass === 'CorpHY' ? 35 : 15,
    amihudIlliquidity: round(tier === 'L1' ? 0.02 : tier === 'L2' ? 0.18 : 1.2, 3),
    depthBid: 5_000_000,
    depthAsk: 5_000_000,
  };
}

function issuerFundamentalsFields(u: UniverseEntry) {
  return {
    issuerRevenueLtm: u.issuerRevenueLtm,
    issuerEbitdaLtm: u.issuerEbitdaLtm,
    issuerLeverage: u.issuerLeverage,
    issuerCoverage: u.issuerCoverage,
    issuerCash: u.issuerCash,
    issuerDebt: u.issuerDebt,
    issuerMcap: u.issuerMcap,
    issuerStockPrice: u.issuerStockPrice,
  };
}

function timestampFields() {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  return {
    lastUpdate: now,
    asOf: iso,
    snapshotTs: iso,
    createdTs: iso,
    updatedTs: iso,
  };
}

/** Build a fresh position row. `posIdx` rotates account assignment. */
export function buildPosition(u: UniverseEntry, posIdx: number): PositionRow {
  const mid = jitter(u.anchorPrice, 0.001);
  const midYld = jitter(u.anchorYield, 0.001);
  const spread = u.anchorSpreadBps + (Math.random() - 0.5) * 2;
  const dur = Math.max(0.25, u.originalMaturityYears * 0.85);

  const isMbs = u.assetClass === 'AgencyMBS';
  const factor = isMbs ? clamp(1 - Math.random() * 0.4, 0.5, 1) : 1;
  const qty = isMbs ? 5_000_000 : u.assetClass === 'Rates' ? 25_000_000 : 5_000_000;
  const accrued = (u.couponRate / 100) * qty * factor * (90 / 360);
  const avgCost = mid * (0.95 + Math.random() * 0.07);
  const openDate = new Date(Date.now() - Math.floor(Math.random() * 200) * 86400000).toISOString().slice(0, 10);

  const dirtyMv = (mid / 100) * qty * factor + accrued;
  const mvPct = round(dirtyMv / 1e9, 4); // % of a $1B portfolio (toy)

  return {
    ...identifierFields(u, posIdx),
    ...issuerFields(u),
    ...instrumentCoreFields(u),
    ...couponFields(u),
    ...callPutSinkFields(u),
    ...pricingFields(u, mid, midYld, spread),
    ...yieldFields(u, midYld, spread),
    ...spreadFields(u, spread),
    ...riskFields(u),
    ...creditFields(u),
    ...mbsFields(u),
    ...muniFields(u),
    ...floaterFields(u),
    ...convertibleFields(u, mid),
    ...positionPnLFields(u, qty, factor, mid, accrued, avgCost),
    ...accountAndDeskFields(u, posIdx, openDate),
    ...complianceAndLimitsFields(u),
    ...exposureFields(u, dur, spread, mvPct),
    ...liquidityFields(u),
    ...issuerFundamentalsFields(u),
    ...timestampFields(),
  } as PositionRow;
}

/**
 * Advance a position by a small random walk. Mutates pricing, yields,
 * spread, accrued, and the derived MV / P&L fields. Returns a new
 * object — does not mutate the input.
 */
export function tickPosition(row: PositionRow): PositionRow {
  const oldMid = row.midPrice;
  const newMid = round(clamp(oldMid + (Math.random() - 0.5) * 0.08, oldMid * 0.85, oldMid * 1.15), 4);
  const oldYld = row.yieldToMaturity;
  // Yield moves inversely to price; small magnitude.
  const newYld = round(clamp(oldYld - (newMid - oldMid) * 0.18, 0.1, 25), 4);
  const oldOas = row.oas;
  const newOas = round(clamp(oldOas + (Math.random() - 0.5) * 0.6, -10, 1500), 2);

  const halfSpread = (row.assetClass as string) === 'Rates' ? 0.02
    : (row.assetClass as string) === 'CorpHY' ? 0.35
    : 0.08;
  const bid = round(newMid - halfSpread, 4);
  const ask = round(newMid + halfSpread, 4);
  const last = round(newMid + (Math.random() - 0.5) * halfSpread * 0.4, 4);

  const qty = row.quantityFace;
  const factor = row.factor;
  const accrueIncrement = (row.accruedInterest / 90) * 0.01;
  const newAccrued = round(row.accruedInterest + accrueIncrement, 2);
  const dirtyMv = round((newMid / 100) * qty * factor + newAccrued, 2);
  const unrealized = round(dirtyMv - newAccrued - (row.avgCost / 100) * qty * factor, 2);
  const dailyPnL = round(unrealized - row.unrealizedPnL + (row.dailyPnL || 0), 2);

  const now = Date.now();
  const iso = new Date(now).toISOString();

  return {
    ...row,
    bidPrice: bid,
    askPrice: ask,
    midPrice: newMid,
    lastPrice: last,
    evalPrice: round(newMid + (Math.random() - 0.5) * 0.02, 4),
    bidYield: round(newYld + 0.005, 4),
    askYield: round(newYld - 0.005, 4),
    midYield: newYld,
    yieldToMaturity: newYld,
    yieldToWorst: round(newYld - 0.05, 4),
    oas: newOas,
    iSpread: round(newOas + 3, 2),
    gSpread: round(newOas + 4, 2),
    zSpread: round(newOas + 5, 2),
    benchmarkSpreadBps: round(newOas, 2),
    bidSpread: round(newOas + 0.5, 2),
    askSpread: round(newOas - 0.5, 2),
    quotedSpread: round(newOas, 2),
    bidSize: 1_000_000 * (1 + Math.floor(Math.random() * 5)),
    askSize: 1_000_000 * (1 + Math.floor(Math.random() * 5)),
    priceChange: round(newMid - oldMid, 4),
    priceChangePct: round(((newMid - oldMid) / oldMid) * 100, 4),
    yieldChange: round(newYld - oldYld, 4),
    accruedInterest: newAccrued,
    marketValue: dirtyMv,
    unrealizedPnL: unrealized,
    dailyPnL,
    lastUpdate: now,
    asOf: iso,
    snapshotTs: iso,
    updatedTs: iso,
    priceTime: iso,
  };
}
