/**
 * mockTrade — builds 200+ field trade rows linked to the position
 * universe by CUSIP. Includes a small lifecycle state machine so
 * ticks produce realistic status transitions
 * (New → Executed → Allocated → Confirmed → Settled), occasional
 * fails/amendments, and the ability to mint brand new trades.
 *
 * The dispatcher in mock.ts picks a tick action each interval:
 *   - mutate an existing trade's status / fills / TCA
 *   - mint a new trade for a random CUSIP
 *   - occasionally retire a settled trade (returned as no-op here;
 *     mock.ts handles the cache cap)
 */

import { getUniverse, type UniverseEntry } from './mockUniverse.js';

export type TradeStatus =
  | 'New'
  | 'Pending'
  | 'Executed'
  | 'Allocated'
  | 'Confirmed'
  | 'Settled'
  | 'Failed'
  | 'Cancelled'
  | 'Amended';

export interface TradeRow extends Record<string, unknown> {
  id: string;
  tradeId: string;
  cusip: string;
  tradeStatus: TradeStatus;
  side: 'Buy' | 'Sell';
  tradeQty: number;
  executedQty: number;
  remainingQty: number;
  avgPrice: number;
  proceeds: number;
  lastUpdate: number;
}

const TRADERS = [
  { initials: 'TKW', name: 'T. Wong',    desk: 'IG',   book: 'IG-Core'     },
  { initials: 'AJP', name: 'A. Patel',   desk: 'HY',   book: 'HY-Opp'      },
  { initials: 'CRL', name: 'C. Liu',     desk: 'Rates',book: 'Rates-Curve' },
  { initials: 'DSS', name: 'D. Singh',   desk: 'Sec',  book: 'Sec-Beta'    },
  { initials: 'ERZ', name: 'E. Ramirez', desk: 'Muni', book: 'Muni-TE'     },
];
const COUNTERPARTIES = [
  { name: 'Goldman Sachs & Co. LLC',        type: 'BD', country: 'US', lei: 'FOR8UP27PHTHYVLBNG30', rating: 'A',  idb: false },
  { name: 'Morgan Stanley & Co. LLC',       type: 'BD', country: 'US', lei: '9R7GPTSO7KV3UQJZQ078',  rating: 'A',  idb: false },
  { name: 'JPMorgan Securities LLC',        type: 'BD', country: 'US', lei: 'ZBUT11V806EZRVTWT807',  rating: 'A',  idb: false },
  { name: 'Citigroup Global Markets',       type: 'BD', country: 'US', lei: '6SHGI4ZSSLCXXQSBB395',  rating: 'A',  idb: false },
  { name: 'Bank of America Securities',     type: 'BD', country: 'US', lei: 'B4TYDEB6GKMZO031MB27',  rating: 'A',  idb: false },
  { name: 'Tradeweb Markets (IDB)',         type: 'IDB',country: 'US', lei: 'XYZ123IDB',             rating: 'AA', idb: true  },
  { name: 'MarketAxess (IDB)',              type: 'IDB',country: 'US', lei: 'XYZ123MKX',             rating: 'AA', idb: true  },
];
const VENUES = [
  { name: 'Bloomberg BMTF',  type: 'ATS', protocol: 'RFQ',    mic: 'BMTF', electronic: true,  voice: false, internal: false },
  { name: 'Tradeweb',        type: 'MTF', protocol: 'RFQ',    mic: 'TWEU', electronic: true,  voice: false, internal: false },
  { name: 'MarketAxess Open Trading', type: 'MTF', protocol: 'A2A', mic: 'MAXA', electronic: true, voice: false, internal: false },
  { name: 'Voice',           type: 'OTC', protocol: 'Voice',  mic: 'XOTC', electronic: false, voice: true,  internal: false },
  { name: 'Internal Cross',  type: 'OTC', protocol: 'Cross',  mic: 'XOFF', electronic: false, voice: false, internal: true  },
];

function pick<T>(arr: ReadonlyArray<T>): T { return arr[Math.floor(Math.random() * arr.length)]; }
function round(n: number, dp: number): number { return Number(n.toFixed(dp)); }
function pad(n: number, w: number): string { return String(n).padStart(w, '0'); }

let tradeSeq = 0;
function nextTradeId(): string {
  tradeSeq++;
  return `TRD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${pad(tradeSeq, 7)}`;
}

function identifierFields(u: UniverseEntry, tradeId: string) {
  return {
    id: tradeId,
    tradeId,
    parentOrderId: `ORD-${tradeId.split('-').pop()}`,
    blockId: `BLK-${tradeId.split('-').pop()}`,
    cusip: u.cusip,
    isin: u.isin,
    ticker: u.ticker,
    tradeKey: `${u.cusip}-${tradeId}`,
    externalId: `EXT-${pad(Math.floor(Math.random() * 1e9), 9)}`,
    counterpartyTradeId: `CPT-${pad(Math.floor(Math.random() * 1e9), 9)}`,
    ticketNumber: `TKT-${pad(Math.floor(Math.random() * 1e6), 6)}`,
  };
}

function secRefFields(u: UniverseEntry) {
  return {
    instrumentDescription: `${u.issuerName} ${u.couponRate.toFixed(3)}% ${u.maturityDate}`,
    assetClass: u.assetClass,
    securityType: u.securityType,
    issuerName: u.issuerName,
    issuerSector: u.issuerSector,
    couponRate: u.couponRate,
    maturityDate: u.maturityDate,
    currency: u.currency,
    compositeRating: u.compositeRating,
    seniority: u.seniority,
    countryCode: u.issuerCountryCode,
    callable: u.callable,
  };
}

function economicFields(u: UniverseEntry, side: 'Buy' | 'Sell', qty: number, px: number) {
  const accruedPerMm = (u.couponRate / 100) * 1_000_000 * (60 / 360);
  const principal = round((px / 100) * qty, 2);
  const accrued = round((accruedPerMm / 1_000_000) * qty, 2);
  const proceeds = round(side === 'Buy' ? principal + accrued : principal + accrued, 2);
  return {
    side,
    tradeQty: qty,
    originalQty: qty,
    executedQty: qty,
    remainingQty: 0,
    avgPrice: round(px, 4),
    lastPrice: round(px, 4),
    limitPrice: round(side === 'Buy' ? px + 0.05 : px - 0.05, 4),
    yield: round(u.anchorYield + (Math.random() - 0.5) * 0.05, 4),
    spreadBps: round(u.anchorSpreadBps + (Math.random() - 0.5) * 2, 2),
    dirtyPrice: round(px + accrued / qty * 100, 4),
    cleanPrice: round(px, 4),
    accruedInterest: accrued,
    principal,
    proceeds,
    nettedAmount: proceeds,
    tradeFx: 1,
    baseProceeds: proceeds,
    localProceeds: proceeds,
    fxRate: 1,
  };
}

function timeFields() {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  return {
    tradeDate: iso.slice(0, 10),
    tradeTime: iso,
    settlementDate: new Date(now + 2 * 86400000).toISOString().slice(0, 10),
    enteredTime: iso,
    executedTime: iso,
    allocatedTime: null as string | null,
    settledTime: null as string | null,
    cancelledTime: null as string | null,
  };
}

function settlementFields(u: UniverseEntry) {
  return {
    settleType: u.assetClass === 'Rates' ? 'T+1' : 'T+2',
    settleCycle: u.assetClass === 'Rates' ? 1 : 2,
    clearingHouse: u.assetClass === 'Rates' ? 'FICC GSD' : u.assetClass === 'AgencyMBS' ? 'FICC MBSD' : 'DTC',
    depository: u.assetClass === 'Muni' ? 'DTC' : 'DTC',
    settleStatus: 'Pending',
    settleAmount: 0,
    settleCurrency: 'USD',
    settleInstruction: 'DVP',
  };
}

function partyFields(u: UniverseEntry) {
  const trader = pick(TRADERS);
  return {
    trader: trader.name,
    traderInitials: trader.initials,
    desk: trader.desk,
    book: trader.book,
    portfolio: 'Strategic Income',
    strategy: u.assetClass === 'CorpHY' ? 'HY Opportunity' : u.assetClass === 'Rates' ? 'Curve' : 'Core IG',
    pm: 'A. Tan',
    analyst: 'L. Chen',
    salesPerson: 'S. Gomez',
    accountId: 'ACCT-001',
    accountName: 'Core IG Fund',
    accountType: 'Discretionary',
    accountCustodian: 'BNY Mellon',
    accountTaxStatus: u.federalTaxStatus === 'TaxExempt' ? 'TaxExempt' : 'Taxable',
    fundFamily: 'StarUI Capital',
  };
}

function counterpartyFields() {
  const cp = pick(COUNTERPARTIES);
  return {
    counterparty: cp.name,
    counterpartyLei: cp.lei,
    counterpartyType: cp.type,
    counterpartyCountry: cp.country,
    counterpartyRating: cp.rating,
    broker: cp.name,
    brokerCode: cp.name.slice(0, 4).toUpperCase(),
    broker_isIDB: cp.idb,
  };
}

function venueFields() {
  const v = pick(VENUES);
  return {
    venue: v.name,
    venueType: v.type,
    protocol: v.protocol,
    venueOrderId: `VOI-${pad(Math.floor(Math.random() * 1e7), 7)}`,
    micCode: v.mic,
    tradeCapacity: 'Principal',
    liquidityFlag: 'Added',
    is_voice: v.voice,
    is_electronic: v.electronic,
    is_internal_cross: v.internal,
  };
}

function tcaFields(u: UniverseEntry, px: number) {
  const arrival = round(px + (Math.random() - 0.5) * 0.05, 4);
  const cover = round(px + (Math.random() - 0.5) * 0.07, 4);
  return {
    arrivalPrice: arrival,
    arrivalYield: round(u.anchorYield, 4),
    arrivalSpread: round(u.anchorSpreadBps, 2),
    coverPrice: cover,
    coverYield: round(u.anchorYield + 0.01, 4),
    coverSpread: round(u.anchorSpreadBps + 1, 2),
    priceImprovement_bps: round((cover - px) * 100, 2),
    slippage_bps: round((px - arrival) * 100, 2),
    benchmarkPrice: round(u.anchorPrice, 4),
    benchmarkSpread: round(u.anchorSpreadBps, 2),
    numQuotesReceived: 3 + Math.floor(Math.random() * 6),
    responseTimeMs: Math.floor(100 + Math.random() * 1500),
    bestBid: round(px - 0.04, 4),
    bestAsk: round(px + 0.04, 4),
    midAtArrival: arrival,
  };
}

function riskAtTradeFields(u: UniverseEntry, qty: number) {
  const dur = Math.max(0.25, u.originalMaturityYears * 0.85);
  const dv01 = round((dur * qty) / 1_000_000, 4);
  const krd = {
    '1Y':  round(dur * 0.05, 4),
    '2Y':  round(dur * 0.10, 4),
    '5Y':  round(dur * 0.25, 4),
    '10Y': round(dur * 0.40, 4),
    '30Y': round(dur * 0.20, 4),
  };
  return {
    tradeDuration: round(dur, 4),
    tradeDv01: dv01,
    tradeCs01: u.assetClass === 'Rates' ? 0 : round(dv01 * 0.95, 4),
    tradeOas: round(u.anchorSpreadBps, 2),
    tradeKeyRateDurations: krd,
    positionImpactDv01: round(dv01 * 0.7, 4),
    positionImpactCs01: u.assetClass === 'Rates' ? 0 : round(dv01 * 0.6, 4),
    preTradeMv: round(qty * 0.5, 2),
    postTradeMv: round(qty * 0.5 + (qty * u.anchorPrice) / 100, 2),
    mvChange: round((qty * u.anchorPrice) / 100, 2),
  };
}

function complianceFields() {
  return {
    complianceStatus: 'Approved' as const,
    complianceCheckedAt: new Date().toISOString(),
    complianceCheckedBy: 'CHECK-SVC',
    complianceRules: { restricted: 'pass', concentration: 'pass', creditLine: 'pass', wrongWay: 'pass' },
    preTradeBlocks: [],
    amendmentReason: null,
    restrictedList_hit: false,
    concentrationCheck: 'pass',
    crossingCheck: 'pass',
    wrongWayRisk: 'pass',
  };
}

function regulatoryFields(u: UniverseEntry) {
  const isTraced = u.assetClass === 'CorpIG' || u.assetClass === 'CorpHY' || u.assetClass === 'Convertible';
  const isMsrb = u.assetClass === 'Muni';
  const now = new Date().toISOString();
  return {
    regReportingJurisdictions: isMsrb ? ['MSRB'] : isTraced ? ['TRACE'] : ['FICC'],
    traceEligible: isTraced,
    traceReportedTs: isTraced ? now : null,
    traceDisseminatedTs: isTraced ? now : null,
    traceDisseminationCap: isTraced ? 5_000_000 : null,
    msrbReportedTs: isMsrb ? now : null,
    emmaReported: isMsrb,
    mifidFlags: { lis: false, lis_waiver: false, deferral: false, post_trade_pub: 'TPlus' },
    mifidPostTradeFlag: 'TPlus',
    mifidLargeInScale: false,
    mifidPreTradeWaiver: false,
    emirReported: false,
    doddFrank_swapDataRepo: null,
    ficcCleared: u.assetClass === 'Rates' || u.assetClass === 'AgencyMBS',
    ssrFlag: false,
  };
}

function lifecycleFields(now: number, status: TradeStatus) {
  const iso = new Date(now).toISOString();
  return {
    tradeStatus: status,
    statusHistory: [{ status: 'New', ts: iso }],
    allocationStatus: 'Pending',
    allocationCount: 1,
    allocations: [],
    confirmStatus: 'Pending',
    confirmSentAt: null as string | null,
    confirmReceivedAt: null as string | null,
    failReason: null as string | null,
    claimStatus: 'NotApplicable',
    cancelStatus: 'NotCancelled',
    amendStatus: 'Original',
    amendCount: 0,
    lastAmendmentTs: null as string | null,
    lifecycleStage: 'PreAllocation',
  };
}

function allocationFields(qty: number, px: number) {
  return {
    allocAccount: 'ACCT-001',
    allocQty: qty,
    allocPrice: round(px, 4),
    allocProceeds: round((px / 100) * qty, 2),
    allocFee: 0,
    allocCommission: 0,
    allocSettleDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    allocStatus: 'Pending',
  };
}

function feeFields(u: UniverseEntry, principal: number) {
  const secFee = u.assetClass === 'CorpIG' || u.assetClass === 'CorpHY' ? round(principal * 0.0000278, 4) : 0;
  const tafFee = u.assetClass === 'CorpIG' || u.assetClass === 'CorpHY' ? round(principal * 0.000119, 4) : 0;
  return {
    commissionBps: 0,
    commissionAmount: 0,
    fees: { sec: secFee, taf: tafFee, exch: 0, clear: 0, other: 0 },
    secFee,
    tafFee,
    exchangeFee: 0,
    clearingFee: 0,
    brokerFee: 0,
    salesCredit: round(principal * 0.000125, 2),
    markupBps: round(2 + Math.random() * 4, 2),
  };
}

function auditFields() {
  const now = new Date().toISOString();
  return {
    createdBy: 'OMS',
    createdAt: now,
    modifiedBy: 'OMS',
    modifiedAt: now,
    amendments: [],
    notes: null as string | null,
    sourceSystem: 'OMS',
    sourceTradeId: null as string | null,
    routedFrom: 'Trader',
    routedTo: 'Counterparty',
  };
}

function marketContextFields(u: UniverseEntry, px: number) {
  return {
    mktBid: round(px - 0.05, 4),
    mktAsk: round(px + 0.05, 4),
    mktMid: round(px, 4),
    mktSpread: 0.10,
    mktTradingPattern: 'Normal',
    mktVwapDay: round(px - 0.02, 4),
    mktDayHigh: round(px + 0.18, 4),
    mktDayLow: round(px - 0.21, 4),
  };
}

function linkageFields(u: UniverseEntry, tradeId: string) {
  return {
    orderId: `ORD-${tradeId.split('-').pop()}`,
    positionId: `POS-${u.cusip}-0`,
    blockSize: 1,
    linkedTradeIds: [],
    partOfBasket: false,
  };
}

function flagsFields(u: UniverseEntry) {
  return {
    tradeReason: pick(['Rebalance', 'New Money', 'Tax Loss Harvest', 'Roll', 'Hedge']),
    tradeStrategy: u.assetClass === 'Rates' ? 'Curve' : u.assetClass === 'CorpHY' ? 'Credit Pickup' : 'Carry',
    crossWithDeskId: null as string | null,
    clientOrderId: `CL-${pad(Math.floor(Math.random() * 1e7), 7)}`,
    isHedge: false,
    isAllocation: false,
    isErrorTrade: false,
    isUnwind: false,
  };
}

/**
 * Mint a new trade row for a given universe entry. The trade starts
 * in `New` status — `tickTrade` is what walks it through the lifecycle.
 */
export function buildTrade(u: UniverseEntry): TradeRow {
  const tradeId = nextTradeId();
  const side: 'Buy' | 'Sell' = Math.random() < 0.55 ? 'Buy' : 'Sell';
  const qty = (u.assetClass === 'Rates' ? 5 : 1) * 1_000_000 * (1 + Math.floor(Math.random() * 10));
  const px = u.anchorPrice + (Math.random() - 0.5) * 0.1;
  const principal = (px / 100) * qty;
  const now = Date.now();

  return {
    ...identifierFields(u, tradeId),
    ...secRefFields(u),
    ...economicFields(u, side, qty, px),
    ...timeFields(),
    ...settlementFields(u),
    ...partyFields(u),
    ...counterpartyFields(),
    ...venueFields(),
    ...tcaFields(u, px),
    ...riskAtTradeFields(u, qty),
    ...complianceFields(),
    ...regulatoryFields(u),
    ...lifecycleFields(now, 'New'),
    ...allocationFields(qty, px),
    ...feeFields(u, principal),
    ...auditFields(),
    ...marketContextFields(u, px),
    ...linkageFields(u, tradeId),
    ...flagsFields(u),
    lastUpdate: now,
  } as TradeRow;
}

const STATUS_FLOW: ReadonlyArray<TradeStatus> = [
  'New', 'Pending', 'Executed', 'Allocated', 'Confirmed', 'Settled',
];

/**
 * Advance a trade by one lifecycle step. Updates the corresponding
 * timestamp, status history, allocation/confirm/settle state, and
 * occasionally injects an amendment or a fail. Returns a new row.
 */
export function tickTrade(row: TradeRow): TradeRow {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const current = row.tradeStatus;
  const idx = STATUS_FLOW.indexOf(current);

  // 6% chance of an amendment (re-execution at a slightly different price)
  if (Math.random() < 0.06 && current !== 'Settled' && current !== 'Cancelled') {
    const delta = (Math.random() - 0.5) * 0.04;
    const newPx = Number((row.avgPrice + delta).toFixed(4));
    return {
      ...row,
      avgPrice: newPx,
      lastPrice: newPx,
      cleanPrice: newPx,
      principal: Number(((newPx / 100) * row.tradeQty).toFixed(2)),
      proceeds: Number(((newPx / 100) * row.tradeQty + (row.accruedInterest as number)).toFixed(2)),
      amendStatus: 'Amended',
      amendCount: (row.amendCount as number) + 1,
      lastAmendmentTs: iso,
      amendments: [...(row.amendments as unknown[]), { ts: iso, type: 'Repricing', oldPrice: row.avgPrice, newPrice: newPx }],
      modifiedAt: iso,
      lastUpdate: now,
    };
  }

  // 1.5% chance of a fail when at Settled boundary
  if (current === 'Confirmed' && Math.random() < 0.015) {
    return {
      ...row,
      tradeStatus: 'Failed',
      statusHistory: [...(row.statusHistory as unknown[]), { status: 'Failed', ts: iso }],
      failReason: 'Counterparty SD mismatch',
      settleStatus: 'Failed',
      modifiedAt: iso,
      lastUpdate: now,
    };
  }

  // 0.5% cancel from early states
  if ((current === 'New' || current === 'Pending') && Math.random() < 0.005) {
    return {
      ...row,
      tradeStatus: 'Cancelled',
      cancelStatus: 'Cancelled',
      cancelledTime: iso,
      statusHistory: [...(row.statusHistory as unknown[]), { status: 'Cancelled', ts: iso }],
      modifiedAt: iso,
      lastUpdate: now,
    };
  }

  if (idx === -1 || idx === STATUS_FLOW.length - 1) {
    return { ...row, lastUpdate: now };
  }

  const next = STATUS_FLOW[idx + 1];
  const patch: Partial<TradeRow> & Record<string, unknown> = {
    tradeStatus: next,
    statusHistory: [...(row.statusHistory as unknown[]), { status: next, ts: iso }],
    modifiedAt: iso,
    lastUpdate: now,
  };
  if (next === 'Executed') {
    patch.executedTime = iso;
    patch.lifecycleStage = 'PostExecution';
  }
  if (next === 'Allocated') {
    patch.allocatedTime = iso;
    patch.allocationStatus = 'Complete';
    patch.allocations = [{
      account: 'ACCT-001',
      qty: row.tradeQty,
      price: row.avgPrice,
      proceeds: row.proceeds,
      settleDate: row.settlementDate,
    }];
    patch.lifecycleStage = 'PostAllocation';
  }
  if (next === 'Confirmed') {
    patch.confirmSentAt = iso;
    patch.confirmReceivedAt = iso;
    patch.confirmStatus = 'Confirmed';
    patch.lifecycleStage = 'PreSettlement';
  }
  if (next === 'Settled') {
    patch.settledTime = iso;
    patch.settleStatus = 'Settled';
    patch.settleAmount = row.proceeds;
    patch.lifecycleStage = 'Settled';
  }
  return { ...row, ...patch };
}

/** Return a random universe entry — biased to credit (which trades more). */
export function pickTradingCusip(): UniverseEntry {
  const u = getUniverse();
  // 60% credit, 25% rates+agency+mbs, 10% muni, 5% other
  const roll = Math.random();
  const pool = roll < 0.60 ? u.filter((e) => e.assetClass === 'CorpIG' || e.assetClass === 'CorpHY')
    : roll < 0.85 ? u.filter((e) => e.assetClass === 'Rates' || e.assetClass === 'Agency' || e.assetClass === 'AgencyMBS')
    : roll < 0.95 ? u.filter((e) => e.assetClass === 'Muni')
    : u;
  return pool[Math.floor(Math.random() * pool.length)] ?? u[0];
}
