/**
 * Snapshot real corporate issuers and their LEIs from GLEIF.
 *
 * The names and sectors are curated here rather than crawled: GLEIF holds
 * every registered legal entity, so an unfiltered pull returns mostly small
 * LLCs and fund vehicles, not the issuers a fixed-income book holds. GLEIF
 * also publishes no industry classification, so the sector has to come from
 * somewhere — a list of the issuers a US credit book actually owns, tagged by
 * the Bloomberg-style sector the desk trades them under.
 *
 * What GLEIF provides, and what makes this worth doing: the real legal name,
 * the real LEI, and the real jurisdiction. A synthetic LEI looks fine until
 * somebody tries to join on it.
 *
 * Writes `reference/issuers.json`. The service never fetches.
 * Source: GLEIF LEI records. Licensed CC0.
 */
import { writeFileSync } from 'node:fs';

// sector -> issuers. `hy` marks the ones that trade below investment grade.
const CATALOG = {
  Banking: ['JPMorgan Chase', 'Bank of America Corporation', 'Citigroup Inc.', 'Wells Fargo & Company',
    'Goldman Sachs Group', 'Morgan Stanley', 'U.S. Bancorp', 'PNC Financial Services Group',
    'Truist Financial Corporation', 'Capital One Financial Corporation', 'Charles Schwab Corporation',
    'American Express Company', 'Bank of New York Mellon Corporation', 'State Street Corporation',
    'Fifth Third Bancorp', 'KeyCorp', 'Citizens Financial Group', 'Regions Financial Corporation',
    'Huntington Bancshares', 'M&T Bank Corporation',
    { name: 'Ally Financial Inc.', hy: true }, { name: 'OneMain Finance Corporation', hy: true },
    { name: 'Navient Corporation', hy: true }],
  Insurance: ['Berkshire Hathaway Inc.', 'Chubb Limited', 'Progressive Corporation',
    'Allstate Corporation', 'Travelers Companies', 'MetLife, Inc.', 'Prudential Financial, Inc.',
    'Aflac Incorporated', 'Hartford Financial Services Group', 'Lincoln National Corporation'],
  Technology: ['Apple Inc.', 'Microsoft Corporation', 'Oracle Corporation',
    'International Business Machines Corporation', 'Intel Corporation', 'Cisco Systems, Inc.',
    'Broadcom Inc.', 'Texas Instruments Incorporated', 'Salesforce, Inc.', 'Dell Technologies Inc.',
    'HP Inc.', 'Adobe Inc.', 'Micron Technology, Inc.', 'Applied Materials, Inc.',
    'Analog Devices, Inc.', 'NVIDIA Corporation', 'Hewlett Packard Enterprise Company',
    { name: 'Xerox Holdings Corporation', hy: true }],
  Communications: ['AT&T Inc.', 'Verizon Communications Inc.', 'Comcast Corporation',
    'T-Mobile US, Inc.', 'Walt Disney Company', 'Alphabet Inc.', 'Meta Platforms, Inc.',
    { name: 'Charter Communications, Inc.', hy: true }, { name: 'DISH Network Corporation', hy: true },
    { name: 'Altice USA, Inc.', hy: true }, { name: 'Warner Bros. Discovery, Inc.', hy: true },
    { name: 'Paramount Global', hy: true }, { name: 'Lumen Technologies, Inc.', hy: true },
    { name: 'Netflix, Inc.' }],
  'Consumer Cyclical': ['Amazon.com, Inc.', 'Home Depot, Inc.', "McDonald's Corporation",
    "Lowe's Companies, Inc.", 'Starbucks Corporation', 'Target Corporation', 'NIKE, Inc.',
    'TJX Companies, Inc.', 'Marriott International, Inc.', 'Hilton Worldwide Holdings Inc.',
    'General Motors Company', 'Ford Motor Company', 'Genuine Parts Company',
    { name: 'Carnival Corporation', hy: true }, { name: 'Royal Caribbean Cruises Ltd.', hy: true },
    { name: 'Wynn Resorts, Limited', hy: true }, { name: 'MGM Resorts International', hy: true },
    { name: 'Caesars Entertainment, Inc.', hy: true }, { name: 'Carvana Co.', hy: true },
    { name: 'Rite Aid Corporation', hy: true }],
  'Consumer Non-Cyclical': ['Procter & Gamble Company', 'Coca-Cola Company', 'PepsiCo, Inc.',
    'Walmart Inc.', 'Costco Wholesale Corporation', 'Philip Morris International Inc.',
    'Altria Group, Inc.', 'Mondelez International, Inc.', 'Kimberly-Clark Corporation',
    'Colgate-Palmolive Company', 'General Mills, Inc.', 'Kroger Co.', 'Sysco Corporation',
    'Johnson & Johnson', 'Pfizer Inc.', 'Merck & Co., Inc.', 'AbbVie Inc.', 'Amgen Inc.',
    'Bristol-Myers Squibb Company', 'Eli Lilly and Company', 'UnitedHealth Group Incorporated',
    'CVS Health Corporation', 'Cigna Group', 'Gilead Sciences, Inc.',
    'Thermo Fisher Scientific Inc.', 'Abbott Laboratories', 'Medtronic plc', 'Stryker Corporation',
    { name: 'HCA Healthcare, Inc.', hy: true }, { name: 'Tenet Healthcare Corporation', hy: true },
    { name: 'Community Health Systems, Inc.', hy: true }, { name: 'Bausch Health Companies Inc.', hy: true }],
  Energy: ['Exxon Mobil Corporation', 'Chevron Corporation', 'ConocoPhillips',
    'Marathon Petroleum Corporation', 'Phillips 66', 'Valero Energy Corporation',
    'Occidental Petroleum Corporation', 'EOG Resources, Inc.', 'Devon Energy Corporation',
    'Hess Corporation', 'Pioneer Natural Resources Company', 'Baker Hughes Company',
    'Halliburton Company', 'Schlumberger Limited',
    { name: 'Antero Resources Corporation', hy: true }, { name: 'Range Resources Corporation', hy: true },
    { name: 'Southwestern Energy Company', hy: true }, { name: 'Chesapeake Energy Corporation', hy: true },
    { name: 'Murphy Oil Corporation', hy: true }],
  'Natural Gas': ['Kinder Morgan, Inc.', 'Williams Companies, Inc.', 'Energy Transfer LP',
    'Enterprise Products Partners L.P.', 'ONEOK, Inc.', 'MPLX LP', 'Cheniere Energy, Inc.',
    'TC PipeLines, LP', { name: 'NuStar Energy L.P.', hy: true }],
  Electric: ['NextEra Energy', 'Duke Energy Corporation', 'Southern Company',
    'Dominion Energy, Inc.', 'American Electric Power Company, Inc.', 'Exelon Corporation',
    'Xcel Energy Inc.', 'Sempra', 'Consolidated Edison, Inc.', 'PG&E Corporation',
    'Edison International', 'WEC Energy Group, Inc.', 'DTE Energy Company', 'Entergy Corporation',
    'PPL Corporation', 'Ameren Corporation', 'CMS Energy Corporation', 'CenterPoint Energy, Inc.',
    'Eversource Energy', 'Public Service Enterprise Group Incorporated',
    { name: 'FirstEnergy Corp.', hy: true }, { name: 'Vistra Corp.', hy: true }],
  'Capital Goods': ['Boeing Company', 'Caterpillar Inc.', 'Deere & Company',
    'Honeywell International Inc.', 'General Electric Company', '3M Company',
    'Lockheed Martin Corporation', 'RTX Corporation', 'Northrop Grumman Corporation',
    'Emerson Electric Co.', 'Illinois Tool Works Inc.', 'Parker-Hannifin Corporation',
    'General Dynamics Corporation', 'Eaton Corporation plc', 'Cummins Inc.',
    'Waste Management, Inc.', 'Republic Services, Inc.',
    { name: 'Howmet Aerospace Inc.', hy: true }, { name: 'Bombardier Inc.', hy: true }],
  'Basic Industry': ['Dow Inc.', 'LyondellBasell Industries N.V.', 'DuPont de Nemours, Inc.',
    'Air Products and Chemicals, Inc.', 'Sherwin-Williams Company', 'Nucor Corporation',
    'Ecolab Inc.', 'PPG Industries, Inc.', 'International Paper Company', 'Linde plc',
    'Corteva, Inc.', 'Celanese Corporation',
    { name: 'Cleveland-Cliffs Inc.', hy: true }, { name: 'United States Steel Corporation', hy: true },
    { name: 'Freeport-McMoRan Inc.', hy: true }, { name: 'Alcoa Corporation', hy: true }],
  Transportation: ['Union Pacific Corporation', 'CSX Corporation', 'Norfolk Southern Corporation',
    'United Parcel Service, Inc.', 'FedEx Corporation', 'Delta Air Lines, Inc.',
    'Southwest Airlines Co.', 'Ryder System, Inc.',
    { name: 'American Airlines Group Inc.', hy: true }, { name: 'United Airlines Holdings, Inc.', hy: true }],
  REITs: ['Prologis, Inc.', 'American Tower Corporation', 'Equinix, Inc.', 'Simon Property Group, Inc.',
    'Public Storage', 'Realty Income Corporation', 'Welltower Inc.', 'Digital Realty Trust, Inc.',
    'AvalonBay Communities, Inc.', 'Equity Residential', 'Boston Properties, Inc.',
    'Ventas, Inc.', 'Mid-America Apartment Communities, Inc.', 'Essex Property Trust, Inc.',
    'Kimco Realty Corporation', 'Regency Centers Corporation',
    { name: 'Vornado Realty Trust', hy: true }, { name: 'Uniti Group Inc.', hy: true }],
};

const norm = (e) => (typeof e === 'string' ? { name: e, hy: false } : { hy: false, ...e });
const wanted = Object.entries(CATALOG).flatMap(([sector, list]) =>
  list.map((e) => ({ sector, ...norm(e) })));

async function lookup(entry) {
  const url = 'https://api.gleif.org/api/v1/lei-records'
    + `?filter%5Bentity.legalName%5D=${encodeURIComponent(entry.name)}`
    + '&filter%5Bentity.status%5D=ACTIVE&page%5Bsize%5D=1';
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.api+json' } });
    if (!res.ok) return { ...entry, lei: null };
    const body = await res.json();
    const record = (body.data ?? [])[0];
    if (!record) return { ...entry, lei: null };
    const attrs = record.attributes;
    return {
      ...entry,
      lei: attrs.lei,
      legalName: attrs.entity?.legalName?.name ?? entry.name,
      jurisdiction: attrs.entity?.jurisdiction ?? null,
      country: attrs.entity?.legalAddress?.country ?? null,
    };
  } catch {
    return { ...entry, lei: null };
  }
}

// Politeness: a handful at a time rather than 200 at once.
const out = [];
const LANES = 6;
for (let i = 0; i < wanted.length; i += LANES) {
  out.push(...await Promise.all(wanted.slice(i, i + LANES).map(lookup)));
  process.stdout.write(`\r${out.length}/${wanted.length}`);
}
console.log();

const found = out.filter((e) => e.lei !== null);
const missing = out.filter((e) => e.lei === null);
// A duplicate LEI means two catalog names resolved to one legal entity.
const byLei = new Map();
for (const e of found) byLei.set(e.lei, e);

writeFileSync('reference/issuers.json', JSON.stringify({
  source: 'https://www.gleif.org/en/lei-data/gleif-api',
  licence: 'GLEIF LEI data, CC0 1.0',
  fetchedAt: new Date().toISOString(),
  requested: wanted.length,
  issuers: [...byLei.values()].sort((a, b) => a.sector.localeCompare(b.sector) || a.legalName.localeCompare(b.legalName)),
}, null, 1));

console.log(`${found.length}/${wanted.length} resolved, ${byLei.size} distinct entities`);
if (missing.length) console.log(`unresolved: ${missing.map((e) => e.name).join(', ')}`);
