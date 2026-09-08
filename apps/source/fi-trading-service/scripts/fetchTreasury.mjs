/**
 * Snapshot the real Treasury auction record.
 *
 * Run this to refresh `reference/treasuryAuctions.json`; the service NEVER
 * fetches. The scenario engine's whole claim is that a build is reproducible
 * from `(seed, date)`, and a build that depends on a live API is reproducible
 * only until someone reissues. So the network boundary is here, in a script
 * that is run deliberately and whose output is committed.
 *
 * Source: US Treasury Fiscal Data, `auctions_query`. Public domain.
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query';
const FIELDS = [
  'cusip', 'security_type', 'security_term', 'auction_date', 'issue_date',
  'maturity_date', 'dated_date', 'int_rate', 'offering_amt', 'corpus_cusip',
  'first_int_payment_date', 'floating_rate', 'original_security_term',
  'high_investment_rate', 'high_price', 'high_yield',
].join(',');
const PAGE = 1000;

async function page(n) {
  const url = `${BASE}?fields=${FIELDS}&sort=-auction_date&page%5Bsize%5D=${PAGE}&page%5Bnumber%5D=${n}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Treasury API ${res.status} on page ${n}`);
  return res.json();
}

const all = [];
let total = null;
for (let n = 1; n <= 20; n++) {
  const body = await page(n);
  total ??= body.meta?.['total-count'] ?? null;
  const rows = body.data ?? [];
  all.push(...rows);
  process.stdout.write(`\rpage ${n}: ${all.length}/${total ?? '?'}`);
  if (rows.length < PAGE) break;
}
console.log();

/**
 * One record per SECURITY, not per auction.
 *
 * A reopening auctions an existing CUSIP again — same coupon, same maturity —
 * so keying on the auction would mint duplicate securities. The earliest
 * auction of a CUSIP is its original issue; later ones are reopenings, and
 * `reopenings` records how many, because an issue that has been reopened is
 * larger and more liquid than one that has not.
 */
const byCusip = new Map();
for (const r of all) {
  if (!r.cusip) continue;
  const prior = byCusip.get(r.cusip);
  if (prior === undefined) { byCusip.set(r.cusip, { ...r, reopenings: 0 }); continue; }
  prior.reopenings += 1;
  if (r.auction_date < prior.auction_date) Object.assign(prior, r, { reopenings: prior.reopenings });
}

// The API returns the STRING "null" for an absent value, which is truthy —
// `a || null` leaves it in place, and it reached the snapshot in four fields.
const str = (v) => (v === null || v === undefined || v === 'null' || v === '' ? null : String(v));
const num = (v) => (str(v) === null ? null : Number(v));
const securities = [...byCusip.values()].map((r) => ({
  cusip: r.cusip,
  securityType: r.security_type,
  term: r.security_term,
  originalTerm: str(r.original_security_term) ?? str(r.security_term) ?? '',
  auctionDate: r.auction_date,
  issueDate: r.issue_date,
  datedDate: str(r.dated_date) ?? r.issue_date,
  maturityDate: r.maturity_date,
  firstCouponDate: str(r.first_int_payment_date),
  interestRate: num(r.int_rate),
  offeringAmt: num(r.offering_amt),
  corpusCusip: str(r.corpus_cusip),
  isTips: r.security_type === 'TIPS' || r.security_type === 'Inflation-Protected Note',
  isFrn: r.floating_rate === 'Yes',
  investmentRate: num(r.high_investment_rate),
  reopenings: r.reopenings,
})).sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

writeFileSync('reference/treasuryAuctions.json', JSON.stringify({
  source: 'https://fiscaldata.treasury.gov/datasets/treasury-securities-auctions-data/',
  licence: 'US Government work, public domain',
  fetchedAt: new Date().toISOString(),
  auctionRecords: all.length,
  securities,
}, null, 1));
console.log(`${all.length} auctions -> ${securities.length} distinct securities`);
