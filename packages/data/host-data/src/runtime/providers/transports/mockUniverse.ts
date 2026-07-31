/**
 * mockUniverse — module-level singleton of ~50 realistic fixed-income
 * securities spanning rates, agency MBS, CMBS, RMBS, corporate IG, HY,
 * municipals, and convertibles. Positions and trades draw from the
 * same universe so trades.cusip joins to positions.cusip cleanly.
 *
 * The universe is intentionally process-local: the SharedWorker is one
 * OS process, so multiple provider instances inside it (one for
 * positions, one for trades) see the same registry. Reset via
 * `__resetMockUniverse()` (test hook).
 *
 * CUSIPs here are *plausible-looking* — 9 chars with realistic issuer
 * prefixes (912 for Treasuries, 31 for FNMA, etc.) — not real
 * issued securities. Check digits are not real check digits.
 */

export type AssetClass =
  | 'Rates'
  | 'Agency'
  | 'AgencyMBS'
  | 'CMBS'
  | 'RMBS'
  | 'CorpIG'
  | 'CorpHY'
  | 'Muni'
  | 'Convertible';

export type SecurityType =
  | 'TBond'
  | 'TNote'
  | 'TBill'
  | 'AgencyDeb'
  | 'PassThrough'
  | 'CMBS'
  | 'RMBS'
  | 'CorpBond'
  | 'CorpFloater'
  | 'Muni'
  | 'Convertible';

export type Seniority =
  | 'Treasury'
  | 'Agency'
  | 'SeniorSecured'
  | 'SeniorUnsecured'
  | 'Subordinated'
  | 'Subordinate'
  | 'JuniorSubordinated';

export type Currency = 'USD' | 'EUR' | 'GBP';

export interface UniverseEntry {
  cusip: string;
  isin: string;
  sedol: string;
  ticker: string;
  figi: string;
  internalId: string;
  assetClass: AssetClass;
  securityType: SecurityType;
  securitySubType: string;
  seniority: Seniority;
  currency: Currency;

  issuerName: string;
  issuerLei: string;
  issuerCountry: string;
  issuerCountryCode: string;
  issuerSector: string;
  issuerSubSector: string;
  issuerIndustryGroup: string;
  parentIssuer: string | null;
  ultimateParent: string;
  guarantor: string | null;
  issuerType: string;
  esgScore: number;

  issueDate: string;
  firstSettleDate: string;
  maturityDate: string;
  originalMaturityYears: number;
  workoutDate: string;
  workoutPrice: number;

  couponType: 'Fixed' | 'Floating' | 'Step' | 'Zero' | 'PIK';
  couponRate: number;
  couponFrequency: number;
  dayCount: string;
  accrualBasis: string;
  businessDayConvention: string;

  callable: boolean;
  puttable: boolean;
  sinkable: boolean;
  convertible: boolean;
  nextCallDate: string | null;
  nextCallPrice: number | null;
  nextPutDate: string | null;
  nextPutPrice: number | null;
  callSchedule: ReadonlyArray<{ date: string; price: number }>;
  sinkSchedule: ReadonlyArray<{ date: string; amount: number }>;

  // Anchored pricing — runtime walks around these.
  anchorPrice: number;
  anchorYield: number;
  anchorSpreadBps: number;
  benchmark: string;
  benchmarkTenor: string;

  // Ratings tree.
  moodysRating: string;
  moodysOutlook: 'Positive' | 'Stable' | 'Negative' | 'Watch';
  spRating: string;
  spOutlook: 'Positive' | 'Stable' | 'Negative' | 'Watch';
  fitchRating: string;
  fitchOutlook: 'Positive' | 'Stable' | 'Negative' | 'Watch';
  dbrsRating: string;
  compositeRating: string;
  ratingsBucket: 'IG' | 'HY' | 'Treasury' | 'Agency' | 'NR';

  // MBS/CMBS leaves (null when N/A).
  poolNumber: string | null;
  agency: 'FNMA' | 'GNMA' | 'FHLMC' | null;
  mbsType: string | null;
  wac: number | null;
  wam: number | null;
  wala: number | null;
  avgLoanSize: number | null;
  avgFico: number | null;
  avgLtv: number | null;
  avgDti: number | null;
  loanCount: number | null;

  // Muni leaves.
  state: string | null;
  muniSector: string | null;
  federalTaxStatus: 'TaxExempt' | 'AMT' | 'Taxable' | null;
  stateTaxStatus: 'TaxExempt' | 'Taxable' | null;
  insured: boolean | null;
  insurer: string | null;
  useOfProceeds: string | null;
  preRefunded: boolean | null;

  // Floater leaves.
  referenceRate: string | null;
  floatSpreadBps: number | null;
  floatCap: number | null;
  floatFloor: number | null;
  resetFrequency: string | null;

  // Convertible leaves.
  conversionRatio: number | null;
  conversionPrice: number | null;
  underlyingTicker: string | null;

  // Listing / market structure.
  cfiCode: string;
  micCode: string;
  exchange: string;
  listingStatus: 'Listed' | 'OTC';
  trancheId: string | null;

  // Issuer fundamentals snapshot (for credit-bond rows).
  issuerRevenueLtm: number | null;
  issuerEbitdaLtm: number | null;
  issuerLeverage: number | null;
  issuerCoverage: number | null;
  issuerCash: number | null;
  issuerDebt: number | null;
  issuerMcap: number | null;
  issuerStockPrice: number | null;
}

const RAW_UNIVERSE: ReadonlyArray<Partial<UniverseEntry> & Pick<UniverseEntry, 'cusip' | 'assetClass' | 'issuerName' | 'securityType'>> = [
  // ---- US Treasuries (8) ----
  { cusip: '91282CAB7', issuerName: 'US Treasury', assetClass: 'Rates', securityType: 'TNote', couponRate: 3.875, originalMaturityYears: 2, anchorPrice: 99.42, anchorYield: 4.15 },
  { cusip: '91282CAC5', issuerName: 'US Treasury', assetClass: 'Rates', securityType: 'TNote', couponRate: 4.000, originalMaturityYears: 3, anchorPrice: 99.81, anchorYield: 4.06 },
  { cusip: '91282CAD3', issuerName: 'US Treasury', assetClass: 'Rates', securityType: 'TNote', couponRate: 4.125, originalMaturityYears: 5, anchorPrice: 100.12, anchorYield: 4.09 },
  { cusip: '91282CAE1', issuerName: 'US Treasury', assetClass: 'Rates', securityType: 'TNote', couponRate: 4.250, originalMaturityYears: 7, anchorPrice: 100.45, anchorYield: 4.18 },
  { cusip: '91282CAF8', issuerName: 'US Treasury', assetClass: 'Rates', securityType: 'TNote', couponRate: 4.375, originalMaturityYears: 10, anchorPrice: 101.06, anchorYield: 4.24 },
  { cusip: '912810TM0', issuerName: 'US Treasury', assetClass: 'Rates', securityType: 'TBond', couponRate: 4.750, originalMaturityYears: 20, anchorPrice: 103.31, anchorYield: 4.46 },
  { cusip: '912810TN8', issuerName: 'US Treasury', assetClass: 'Rates', securityType: 'TBond', couponRate: 4.625, originalMaturityYears: 30, anchorPrice: 102.78, anchorYield: 4.51 },
  { cusip: '912797HV3', issuerName: 'US Treasury', assetClass: 'Rates', securityType: 'TBill', couponRate: 0,     originalMaturityYears: 0.25, anchorPrice: 98.71, anchorYield: 5.18 },

  // ---- Agency debentures (4) ----
  { cusip: '3135G05K9', issuerName: 'Fannie Mae', assetClass: 'Agency', securityType: 'AgencyDeb', couponRate: 4.500, originalMaturityYears: 5, anchorPrice: 100.06, anchorYield: 4.48, anchorSpreadBps: 39 },
  { cusip: '3133EPLR2', issuerName: 'Federal Home Loan Banks', assetClass: 'Agency', securityType: 'AgencyDeb', couponRate: 4.250, originalMaturityYears: 3, anchorPrice: 99.78, anchorYield: 4.34, anchorSpreadBps: 28 },
  { cusip: '3134GXAB4', issuerName: 'Freddie Mac', assetClass: 'Agency', securityType: 'AgencyDeb', couponRate: 4.750, originalMaturityYears: 7, anchorPrice: 101.21, anchorYield: 4.58, anchorSpreadBps: 40 },
  { cusip: '3133EPMS9', issuerName: 'Federal Farm Credit Banks', assetClass: 'Agency', securityType: 'AgencyDeb', couponRate: 4.875, originalMaturityYears: 10, anchorPrice: 102.06, anchorYield: 4.61, anchorSpreadBps: 37 },

  // ---- Agency MBS pass-throughs (6) ----
  { cusip: '31418EHX9', issuerName: 'Fannie Mae', assetClass: 'AgencyMBS', securityType: 'PassThrough', couponRate: 5.500, originalMaturityYears: 30, anchorPrice: 100.41, anchorYield: 5.61, anchorSpreadBps: 124, agency: 'FNMA', mbsType: 'FNMA 30Y', wac: 5.97, wam: 348, wala: 12 },
  { cusip: '31418EHY7', issuerName: 'Fannie Mae', assetClass: 'AgencyMBS', securityType: 'PassThrough', couponRate: 6.000, originalMaturityYears: 30, anchorPrice: 102.18, anchorYield: 5.71, anchorSpreadBps: 137, agency: 'FNMA', mbsType: 'FNMA 30Y', wac: 6.49, wam: 343, wala: 17 },
  { cusip: '36296RXP4', issuerName: 'Ginnie Mae', assetClass: 'AgencyMBS', securityType: 'PassThrough', couponRate: 5.500, originalMaturityYears: 30, anchorPrice: 100.62, anchorYield: 5.49, anchorSpreadBps: 118, agency: 'GNMA', mbsType: 'GNMA II 30Y', wac: 5.83, wam: 351, wala: 9 },
  { cusip: '36296RXQ2', issuerName: 'Ginnie Mae', assetClass: 'AgencyMBS', securityType: 'PassThrough', couponRate: 6.000, originalMaturityYears: 30, anchorPrice: 102.41, anchorYield: 5.62, anchorSpreadBps: 132, agency: 'GNMA', mbsType: 'GNMA II 30Y', wac: 6.41, wam: 346, wala: 14 },
  { cusip: '3128MJBY5', issuerName: 'Freddie Mac', assetClass: 'AgencyMBS', securityType: 'PassThrough', couponRate: 5.000, originalMaturityYears: 15, anchorPrice: 99.84, anchorYield: 5.27, anchorSpreadBps: 95, agency: 'FHLMC', mbsType: 'FHLMC Gold 15Y', wac: 5.47, wam: 174, wala: 6 },
  { cusip: '3128MJBZ2', issuerName: 'Freddie Mac', assetClass: 'AgencyMBS', securityType: 'PassThrough', couponRate: 4.500, originalMaturityYears: 15, anchorPrice: 98.94, anchorYield: 5.18, anchorSpreadBps: 86, agency: 'FHLMC', mbsType: 'FHLMC Gold 15Y', wac: 4.91, wam: 168, wala: 12 },

  // ---- CMBS (3) ----
  { cusip: '46647PCT0', issuerName: 'JPMCC 2024-C2', assetClass: 'CMBS', securityType: 'CMBS', couponRate: 5.621, originalMaturityYears: 10, anchorPrice: 99.62, anchorYield: 5.71, anchorSpreadBps: 142, trancheId: 'A-3' },
  { cusip: '46647PCU7', issuerName: 'BMARK 2024-V8', assetClass: 'CMBS', securityType: 'CMBS', couponRate: 5.892, originalMaturityYears: 10, anchorPrice: 100.18, anchorYield: 5.87, anchorSpreadBps: 158, trancheId: 'A-S' },
  { cusip: '46647PCV5', issuerName: 'WFCM 2024-C61', assetClass: 'CMBS', securityType: 'CMBS', couponRate: 6.124, originalMaturityYears: 10, anchorPrice: 100.84, anchorYield: 5.99, anchorSpreadBps: 173, trancheId: 'B' },

  // ---- RMBS (2) ----
  { cusip: '07384YXX6', issuerName: 'CSMC 2024-NQM1', assetClass: 'RMBS', securityType: 'RMBS', couponRate: 6.250, originalMaturityYears: 30, anchorPrice: 99.43, anchorYield: 6.32, anchorSpreadBps: 192, trancheId: 'A-1' },
  { cusip: '07384YXY4', issuerName: 'JPMMT 2024-DSC1', assetClass: 'RMBS', securityType: 'RMBS', couponRate: 5.875, originalMaturityYears: 30, anchorPrice: 98.21, anchorYield: 6.10, anchorSpreadBps: 168, trancheId: 'A-2' },

  // ---- IG Corporates (12) ----
  { cusip: '037833DT4', ticker: 'AAPL', issuerName: 'Apple Inc.', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 4.650, originalMaturityYears: 10, anchorPrice: 101.42, anchorYield: 4.47, anchorSpreadBps: 23, issuerSector: 'Technology' },
  { cusip: '594918CD3', ticker: 'MSFT', issuerName: 'Microsoft Corporation', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 4.500, originalMaturityYears: 10, anchorPrice: 100.84, anchorYield: 4.39, anchorSpreadBps: 15, issuerSector: 'Technology' },
  { cusip: '46625HRM9', ticker: 'JPM', issuerName: 'JPMorgan Chase & Co.', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 5.250, originalMaturityYears: 11, anchorPrice: 102.31, anchorYield: 4.96, anchorSpreadBps: 72, issuerSector: 'Financials' },
  { cusip: '06051GJV5', ticker: 'BAC', issuerName: 'Bank of America Corp.', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 5.475, originalMaturityYears: 12, anchorPrice: 102.18, anchorYield: 5.21, anchorSpreadBps: 97, issuerSector: 'Financials' },
  { cusip: '38141GZQ4', ticker: 'GS', issuerName: 'Goldman Sachs Group Inc.', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 5.851, originalMaturityYears: 6, anchorPrice: 103.62, anchorYield: 5.13, anchorSpreadBps: 87, issuerSector: 'Financials' },
  { cusip: '023135CC3', ticker: 'AMZN', issuerName: 'Amazon.com Inc.', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 4.700, originalMaturityYears: 10, anchorPrice: 100.94, anchorYield: 4.58, anchorSpreadBps: 34, issuerSector: 'Consumer Discretionary' },
  { cusip: '02079KAF8', ticker: 'GOOGL', issuerName: 'Alphabet Inc.', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 4.600, originalMaturityYears: 10, anchorPrice: 100.71, anchorYield: 4.51, anchorSpreadBps: 27, issuerSector: 'Communication Services' },
  { cusip: '478160CN2', ticker: 'JNJ', issuerName: 'Johnson & Johnson', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 4.375, originalMaturityYears: 10, anchorPrice: 100.18, anchorYield: 4.35, anchorSpreadBps: 11, issuerSector: 'Health Care' },
  { cusip: '717081EP3', ticker: 'PFE',  issuerName: 'Pfizer Inc.', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 4.750, originalMaturityYears: 10, anchorPrice: 100.62, anchorYield: 4.66, anchorSpreadBps: 42, issuerSector: 'Health Care' },
  { cusip: '30231GBM7', ticker: 'XOM',  issuerName: 'Exxon Mobil Corp.', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 4.900, originalMaturityYears: 12, anchorPrice: 100.87, anchorYield: 4.79, anchorSpreadBps: 55, issuerSector: 'Energy' },
  { cusip: '166764BG4', ticker: 'CVX',  issuerName: 'Chevron Corp.', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 4.950, originalMaturityYears: 10, anchorPrice: 100.94, anchorYield: 4.83, anchorSpreadBps: 59, issuerSector: 'Energy' },
  { cusip: '92857WBX1', ticker: 'NEE',  issuerName: 'NextEra Energy Inc.', assetClass: 'CorpIG', securityType: 'CorpBond', couponRate: 5.050, originalMaturityYears: 10, anchorPrice: 101.06, anchorYield: 4.91, anchorSpreadBps: 67, issuerSector: 'Utilities' },

  // ---- HY Corporates (8) ----
  { cusip: '14040HCG5', ticker: 'COIN', issuerName: 'Coinbase Global Inc.', assetClass: 'CorpHY', securityType: 'CorpBond', couponRate: 7.250, originalMaturityYears: 7, anchorPrice: 99.21, anchorYield: 7.42, anchorSpreadBps: 318, issuerSector: 'Financials' },
  { cusip: '92840VAE3', ticker: 'X',    issuerName: 'United States Steel Corp.', assetClass: 'CorpHY', securityType: 'CorpBond', couponRate: 6.875, originalMaturityYears: 5, anchorPrice: 98.41, anchorYield: 7.31, anchorSpreadBps: 307, issuerSector: 'Materials' },
  { cusip: '278642AS6', ticker: 'ECA',  issuerName: 'Ovintiv Inc.', assetClass: 'CorpHY', securityType: 'CorpBond', couponRate: 7.500, originalMaturityYears: 8, anchorPrice: 100.18, anchorYield: 7.47, anchorSpreadBps: 323, issuerSector: 'Energy' },
  { cusip: '00287YBA4', ticker: 'ABBV', issuerName: 'AbbVie Inc.', assetClass: 'CorpHY', securityType: 'CorpBond', couponRate: 6.500, originalMaturityYears: 8, anchorPrice: 99.78, anchorYield: 6.55, anchorSpreadBps: 231, issuerSector: 'Health Care' },
  { cusip: '83422VAB2', ticker: 'SIRI', issuerName: 'Sirius XM Radio Inc.', assetClass: 'CorpHY', securityType: 'CorpBond', couponRate: 8.125, originalMaturityYears: 7, anchorPrice: 97.84, anchorYield: 8.51, anchorSpreadBps: 427, issuerSector: 'Communication Services' },
  { cusip: '25470DBM9', ticker: 'DISH', issuerName: 'DISH Network Corp.', assetClass: 'CorpHY', securityType: 'CorpBond', couponRate: 11.750, originalMaturityYears: 5, anchorPrice: 84.21, anchorYield: 16.42, anchorSpreadBps: 1220, issuerSector: 'Communication Services' },
  { cusip: '00077XAF6', ticker: 'AAL',  issuerName: 'American Airlines Group Inc.', assetClass: 'CorpHY', securityType: 'CorpBond', couponRate: 8.500, originalMaturityYears: 6, anchorPrice: 100.62, anchorYield: 8.39, anchorSpreadBps: 415, issuerSector: 'Industrials' },
  { cusip: '459745GH3', ticker: 'INVH', issuerName: 'Invitation Homes Operating Partnership LP', assetClass: 'CorpHY', securityType: 'CorpBond', couponRate: 6.875, originalMaturityYears: 9, anchorPrice: 99.41, anchorYield: 6.96, anchorSpreadBps: 272, issuerSector: 'Real Estate' },

  // ---- Municipals (5) ----
  { cusip: '13063DAC4', issuerName: 'State of California GO', assetClass: 'Muni', securityType: 'Muni', couponRate: 4.500, originalMaturityYears: 15, anchorPrice: 102.41, anchorYield: 4.25, anchorSpreadBps: 19, state: 'CA', muniSector: 'GO' },
  { cusip: '64966MAB5', issuerName: 'New York City GO', assetClass: 'Muni', securityType: 'Muni', couponRate: 4.625, originalMaturityYears: 20, anchorPrice: 103.18, anchorYield: 4.31, anchorSpreadBps: 24, state: 'NY', muniSector: 'GO' },
  { cusip: '796720KC8', issuerName: 'San Francisco Bay Area Toll Authority', assetClass: 'Muni', securityType: 'Muni', couponRate: 5.000, originalMaturityYears: 25, anchorPrice: 105.62, anchorYield: 4.41, anchorSpreadBps: 35, state: 'CA', muniSector: 'Transportation' },
  { cusip: '882723AB1', issuerName: 'Texas State University Revenue', assetClass: 'Muni', securityType: 'Muni', couponRate: 4.875, originalMaturityYears: 20, anchorPrice: 104.18, anchorYield: 4.41, anchorSpreadBps: 34, state: 'TX', muniSector: 'Education' },
  { cusip: '650036FA2', issuerName: 'New York State Thruway Authority', assetClass: 'Muni', securityType: 'Muni', couponRate: 4.750, originalMaturityYears: 18, anchorPrice: 103.41, anchorYield: 4.39, anchorSpreadBps: 32, state: 'NY', muniSector: 'Transportation' },

  // ---- Convertibles (2) ----
  { cusip: '88160RAJ9', ticker: 'TSLA', issuerName: 'Tesla Inc.', assetClass: 'Convertible', securityType: 'Convertible', couponRate: 0,     originalMaturityYears: 5, anchorPrice: 113.41, anchorYield: -2.62, anchorSpreadBps: 0, conversionRatio: 3.2786, conversionPrice: 305.05, underlyingTicker: 'TSLA' },
  { cusip: '64110LAR6', ticker: 'NFLX', issuerName: 'Netflix Inc.', assetClass: 'Convertible', securityType: 'Convertible', couponRate: 1.500, originalMaturityYears: 6, anchorPrice: 108.21, anchorYield: 0.12, anchorSpreadBps: 8, conversionRatio: 1.2849, conversionPrice: 778.30, underlyingTicker: 'NFLX' },
];

function pad(n: number, w: number): string { return String(n).padStart(w, '0'); }
function isoDateAdd(refIso: string, days: number): string {
  const t = new Date(refIso).getTime() + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function isoToday(): string { return new Date().toISOString().slice(0, 10); }

function ratingForAssetClass(cls: AssetClass): { moodys: string; sp: string; fitch: string; bucket: UniverseEntry['ratingsBucket'] } {
  if (cls === 'Rates' || cls === 'Agency' || cls === 'AgencyMBS') return { moodys: 'Aaa', sp: 'AA+', fitch: 'AAA', bucket: cls === 'Rates' ? 'Treasury' : 'Agency' };
  if (cls === 'Muni') return { moodys: 'Aa1', sp: 'AA+', fitch: 'AA+', bucket: 'IG' };
  if (cls === 'CMBS' || cls === 'RMBS') return { moodys: 'Aaa', sp: 'AAA', fitch: 'AAA', bucket: 'IG' };
  if (cls === 'CorpIG') return { moodys: 'A2', sp: 'A', fitch: 'A', bucket: 'IG' };
  if (cls === 'CorpHY') return { moodys: 'Ba2', sp: 'BB', fitch: 'BB', bucket: 'HY' };
  return { moodys: 'Ba1', sp: 'BB+', fitch: 'BB+', bucket: 'HY' }; // convertible
}

function fundamentalsForAssetClass(cls: AssetClass, issuer: string): {
  rev: number | null; ebitda: number | null; lev: number | null; cov: number | null;
  cash: number | null; debt: number | null; mcap: number | null; px: number | null;
} {
  if (cls === 'Rates' || cls === 'Agency' || cls === 'AgencyMBS' || cls === 'Muni' || cls === 'CMBS' || cls === 'RMBS') {
    return { rev: null, ebitda: null, lev: null, cov: null, cash: null, debt: null, mcap: null, px: null };
  }
  // Stable hash to vary numbers across issuers but stay deterministic.
  let h = 0;
  for (let i = 0; i < issuer.length; i++) h = (h * 31 + issuer.charCodeAt(i)) | 0;
  const f = (mod: number, base: number) => base + Math.abs(h % mod);
  const lev = cls === 'CorpHY' || cls === 'Convertible' ? 4 + Math.abs(h % 30) / 10 : 1 + Math.abs(h % 25) / 10;
  return {
    rev: f(50000, 8000),
    ebitda: f(15000, 1500),
    lev: Number(lev.toFixed(2)),
    cov: Number((2 + Math.abs(h % 40) / 10).toFixed(2)),
    cash: f(20000, 1000),
    debt: f(40000, 5000),
    mcap: f(500000, 5000),
    px: Number((30 + Math.abs(h % 4000) / 10).toFixed(2)),
  };
}

let cache: ReadonlyArray<UniverseEntry> | null = null;

function hydrate(): ReadonlyArray<UniverseEntry> {
  const today = isoToday();
  return RAW_UNIVERSE.map((raw, i) => {
    const cls = raw.assetClass;
    const rating = ratingForAssetClass(cls);
    const f = fundamentalsForAssetClass(cls, raw.issuerName);
    const matYears = raw.originalMaturityYears ?? 10;
    const maturityDate = isoDateAdd(today, Math.floor(matYears * 365));
    const issueDate = isoDateAdd(today, -Math.floor(matYears * 365 * 0.1));
    const isCallableCredit = cls === 'CorpIG' || cls === 'CorpHY';
    const nextCallDate = isCallableCredit ? isoDateAdd(today, 365 * 2) : null;
    const couponType: UniverseEntry['couponType'] = cls === 'Convertible' && (raw.couponRate ?? 0) === 0
      ? 'Zero'
      : 'Fixed';

    const seniority: Seniority = cls === 'Rates' ? 'Treasury'
      : cls === 'Agency' || cls === 'AgencyMBS' ? 'Agency'
      : cls === 'CorpHY' ? 'SeniorUnsecured'
      : cls === 'CMBS' || cls === 'RMBS' ? 'SeniorSecured'
      : 'SeniorUnsecured';

    const seqIso = pad(i + 100, 4);
    const isin = `US${raw.cusip}${seqIso.slice(0, 1)}`;

    return {
      cusip: raw.cusip,
      isin,
      sedol: `B${pad(i + 1000, 6)}`,
      ticker: raw.ticker ?? raw.issuerName.split(' ')[0].slice(0, 4).toUpperCase(),
      figi: `BBG00${pad(i + 1, 7)}`,
      internalId: `INT-${pad(i + 1, 6)}`,
      assetClass: cls,
      securityType: raw.securityType,
      securitySubType: raw.mbsType ?? raw.muniSector ?? raw.securityType,
      seniority,
      currency: 'USD' as const,

      issuerName: raw.issuerName,
      issuerLei: `LEI${pad(i, 4)}${'00000000000000000'.slice(0, 17)}`,
      issuerCountry: cls === 'Muni' ? 'United States' : 'United States',
      issuerCountryCode: 'US',
      issuerSector: raw.issuerSector ?? (cls === 'Rates' ? 'Sovereign' : cls === 'Agency' || cls === 'AgencyMBS' ? 'Agency' : cls === 'Muni' ? 'Municipal' : 'Securitized'),
      issuerSubSector: raw.issuerSubSector ?? (raw.issuerSector ?? 'General'),
      issuerIndustryGroup: raw.issuerSector ?? 'General',
      parentIssuer: null,
      ultimateParent: raw.issuerName,
      guarantor: cls === 'AgencyMBS' ? 'US Government (implicit)' : null,
      issuerType: cls === 'Rates' ? 'Sovereign' : cls === 'Agency' || cls === 'AgencyMBS' ? 'Agency' : cls === 'Muni' ? 'Municipal' : 'Corporate',
      esgScore: Math.round((5 + (i * 0.13) % 5) * 10) / 10,

      issueDate,
      firstSettleDate: isoDateAdd(issueDate, 1),
      maturityDate,
      originalMaturityYears: matYears,
      workoutDate: maturityDate,
      workoutPrice: 100,

      couponType,
      couponRate: raw.couponRate ?? 0,
      couponFrequency: cls === 'Muni' ? 2 : cls === 'AgencyMBS' ? 12 : 2,
      dayCount: cls === 'Rates' ? 'ACT/ACT' : cls === 'Muni' ? '30/360' : '30/360',
      accrualBasis: cls === 'Rates' ? 'ACT/ACT' : '30/360',
      businessDayConvention: 'Following',

      callable: isCallableCredit || cls === 'Muni' || cls === 'Convertible',
      puttable: cls === 'Convertible',
      sinkable: cls === 'AgencyMBS' || cls === 'CMBS' || cls === 'RMBS',
      convertible: cls === 'Convertible',
      nextCallDate,
      nextCallPrice: isCallableCredit || cls === 'Convertible' ? 100 : null,
      nextPutDate: cls === 'Convertible' ? isoDateAdd(today, 365 * 3) : null,
      nextPutPrice: cls === 'Convertible' ? 100 : null,
      callSchedule: isCallableCredit ? [
        { date: isoDateAdd(today, 365 * 2), price: 102 },
        { date: isoDateAdd(today, 365 * 3), price: 101 },
        { date: isoDateAdd(today, 365 * 4), price: 100 },
      ] : [],
      sinkSchedule: cls === 'AgencyMBS' ? [
        { date: isoDateAdd(today, 365),     amount: 0.12 },
        { date: isoDateAdd(today, 365 * 2), amount: 0.18 },
        { date: isoDateAdd(today, 365 * 3), amount: 0.22 },
      ] : [],

      anchorPrice: raw.anchorPrice ?? 100,
      anchorYield: raw.anchorYield ?? 5,
      anchorSpreadBps: raw.anchorSpreadBps ?? (cls === 'Rates' ? 0 : 50),
      benchmark: cls === 'Rates' ? 'On-the-run' : `UST ${matYears}Y`,
      benchmarkTenor: `${matYears}Y`,

      moodysRating: rating.moodys,
      moodysOutlook: 'Stable',
      spRating: rating.sp,
      spOutlook: 'Stable',
      fitchRating: rating.fitch,
      fitchOutlook: 'Stable',
      dbrsRating: rating.fitch,
      compositeRating: rating.sp,
      ratingsBucket: rating.bucket,

      poolNumber: raw.agency ? `${raw.agency.slice(0, 2)}${pad(i, 6)}` : null,
      agency: raw.agency ?? null,
      mbsType: raw.mbsType ?? null,
      wac: raw.wac ?? null,
      wam: raw.wam ?? null,
      wala: raw.wala ?? null,
      avgLoanSize: cls === 'AgencyMBS' ? 285000 + i * 1500 : cls === 'CMBS' ? 18_500_000 + i * 500_000 : null,
      avgFico: cls === 'AgencyMBS' ? 745 + (i % 30) : null,
      avgLtv: cls === 'AgencyMBS' ? 72 + (i % 8) : cls === 'CMBS' ? 60 + (i % 12) : null,
      avgDti: cls === 'AgencyMBS' ? 36 + (i % 5) : null,
      loanCount: cls === 'AgencyMBS' ? 4500 + i * 35 : cls === 'CMBS' ? 65 + i * 3 : cls === 'RMBS' ? 850 + i * 12 : null,

      state: raw.state ?? null,
      muniSector: raw.muniSector ?? null,
      federalTaxStatus: cls === 'Muni' ? 'TaxExempt' : null,
      stateTaxStatus: cls === 'Muni' ? 'TaxExempt' : null,
      insured: cls === 'Muni' ? false : null,
      insurer: cls === 'Muni' ? null : null,
      useOfProceeds: cls === 'Muni' ? 'General' : null,
      preRefunded: cls === 'Muni' ? false : null,

      referenceRate: null,
      floatSpreadBps: null,
      floatCap: null,
      floatFloor: null,
      resetFrequency: null,

      conversionRatio: raw.conversionRatio ?? null,
      conversionPrice: raw.conversionPrice ?? null,
      underlyingTicker: raw.underlyingTicker ?? null,

      cfiCode: cls === 'Rates' ? 'DBFTFR' : 'DBFUFR',
      micCode: 'XOTC',
      exchange: 'OTC',
      listingStatus: 'OTC',
      trancheId: raw.trancheId ?? null,

      issuerRevenueLtm: f.rev,
      issuerEbitdaLtm: f.ebitda,
      issuerLeverage: f.lev,
      issuerCoverage: f.cov,
      issuerCash: f.cash,
      issuerDebt: f.debt,
      issuerMcap: f.mcap,
      issuerStockPrice: f.px,
    } satisfies UniverseEntry;
  });
}

export function getUniverse(): ReadonlyArray<UniverseEntry> {
  if (cache === null) cache = hydrate();
  return cache;
}

/** Test hook — drops the cache so the next `getUniverse()` rebuilds. */
export function __resetMockUniverse(): void { cache = null; }

/** Find by CUSIP — O(n) over a ~50-row set, no index needed. */
export function findByCusip(cusip: string): UniverseEntry | undefined {
  return getUniverse().find((e) => e.cusip === cusip);
}
