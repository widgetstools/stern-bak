/**
 * Generate the fixed-income blotters into `public/seed.json`.
 *
 * Nine blotters over ONE provider: six dealer desks and three fund mandates.
 * They exist because a firm-wide grid is not what anyone actually has open —
 * a dealer floor specialises by product, so a rates trader never sees a muni,
 * while a multi-sector fund PM has exactly one blotter because allocating
 * across sectors IS the job.
 *
 * Each is an `appConfig` row whose `configId` doubles as the grid's
 * `instanceId` (`profileBundle.ts` reads the row with
 * `configManager.getConfig(scope.instanceId)`), so a blotter is opened with
 * `/#/blotters/marketsgrid?instanceId=<configId>`.
 *
 * Run it again whenever the row shape changes — it is idempotent and rebuilds
 * every FI blotter from the definitions below rather than patching what is
 * already there.
 *
 *   node scripts/buildFiBlotters.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const seedPath = join(root, 'public', 'seed.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
const PROVIDER_ID = 'dp-fi-book';
const NOW = '2026-09-08T12:00:00.000Z';

/**
 * The registry id / template configId, exactly as `deriveTemplateConfigId`
 * builds it and as `create_blotter` uses it: `${componentType}-${subType}`,
 * lowercase, with the subtype slugified from the display name. An arbitrary id
 * works right up until something tries to resolve the template from the pair.
 */
const subTypeOf = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'blotter';
const configIdOf = (name) => `grid-${subTypeOf(name)}`;

const provider = seed.appConfig.find((c) => c.configId === PROVIDER_ID);
if (!provider) throw new Error(`provider ${PROVIDER_ID} not in the seed — run the provider build first`);
const ALL_FIELDS = provider.payload.columnDefinitions.map((c) => c.field);

const pair = (dark, light) => ({ dark, light });
const cr = (kind, config) => ({ cellRendererId: kind, cellRendererConfig: { kind, config } });
const num = (decimals, thousands = true) =>
  ({ kind: 'preset', preset: 'number', options: { decimals, thousands } });

// ─── shared column vocabulary ────────────────────────────────────────────────
// Widths are chosen per column, not per blotter: a CUSIP is the same width
// wherever it appears, and a trader moving between blotters should not have to
// re-learn the layout.
const W = {
  cusip: 100, description: 260, issuerName: 170, securityType: 105, assetClass: 105,
  sector: 115, rating: 70, desk: 120, portfolio: 145, trader: 105, book: 90,
  couponRate: 75, maturityDate: 100, yearsToMaturity: 55, onTheRunRank: 55,
  quotedPrice: 90, priceChange: 70, bidAskPoints: 70, bidPrice: 85, askPrice: 85,
  yieldToMaturity: 70, yieldToWorst: 70, zSpread: 85, oas: 75, currentYield: 70,
  effectiveDuration: 75, modifiedDuration: 75, spreadDuration: 75, convexity: 80,
  effectiveConvexity: 85, effectiveDv01: 85, cs01: 85, weightedAverageLife: 65,
  factor: 70, seniority: 120, ratingBucket: 60, workoutType: 80, callable: 65,
  currentFace: 115, marketValue: 125, unrealizedPnL: 115, dailyPnL: 105, avgCost: 85,
  axeSide: 70, axeSizeUsd: 110, inventoryAgeDays: 70,
  portfolioWeightPct: 75, benchmarkWeightPct: 75, activeWeightPct: 75,
  krd2Y: 85, krd5Y: 85, krd10Y: 85, krd30Y: 85, bookType: 70, benchmark: 175,
};
const HEADERS = {
  cusip: 'CUSIP', description: 'Security', issuerName: 'Issuer', securityType: 'Type',
  assetClass: 'Asset Class', sector: 'Sector', rating: 'Rating', desk: 'Desk',
  portfolio: 'Portfolio', trader: 'Trader', book: 'Book', couponRate: 'Coupon',
  maturityDate: 'Maturity', yearsToMaturity: 'Yrs', onTheRunRank: 'OTR',
  quotedPrice: 'Price', priceChange: 'Chg', bidAskPoints: 'B/A', bidPrice: 'Bid',
  askPrice: 'Ask', yieldToMaturity: 'YTM', yieldToWorst: 'YTW', zSpread: 'Z-Spd',
  oas: 'OAS', currentYield: 'Cur Yld', effectiveDuration: 'Eff Dur',
  modifiedDuration: 'Mod Dur', spreadDuration: 'Spd Dur', convexity: 'Cvx',
  effectiveConvexity: 'Eff Cvx', effectiveDv01: 'DV01', cs01: 'CS01',
  weightedAverageLife: 'WAL', factor: 'Factor', seniority: 'Seniority',
  ratingBucket: 'IG/HY', workoutType: 'Workout', callable: 'Call',
  currentFace: 'Face', marketValue: 'Market Value', unrealizedPnL: 'Unreal P&L',
  dailyPnL: 'Daily P&L', avgCost: 'Avg Cost', axeSide: 'Axe',
  axeSizeUsd: 'Axe Size', inventoryAgeDays: 'Age', portfolioWeightPct: 'Wgt %',
  benchmarkWeightPct: 'Bmk %', activeWeightPct: 'Active %',
  krd2Y: 'KRD 2Y', krd5Y: 'KRD 5Y', krd10Y: 'KRD 10Y', krd30Y: 'KRD 30Y',
  bookType: 'Book Type', benchmark: 'Benchmark',
};

// Renderers and formats, applied wherever the column appears.
const RENDERERS = {
  rating: cr('pill', { rules: [
    ['AAA', '#103418', '#d6f4dd', '#7fdf9b', '#1f5d34'], ['AA', '#0e3046', '#dbeefd', '#7cc7f9', '#0f4d75'],
    ['A', '#102e3a', '#dfeef4', '#7ec4d8', '#10495a'], ['BBB', '#33310c', '#f7f1cc', '#e5dd6f', '#5d551a'],
    ['BB', '#3a2614', '#fbe7d7', '#f0a576', '#7a3b14'], ['B', '#3a1818', '#fcdada', '#ee8e8e', '#7a1f1f'],
    ['CCC', '#3a1818', '#fcdada', '#ee8e8e', '#7a1f1f'], ['D', '#450a0a', '#fecaca', '#fca5a5', '#7f1d1d'],
  ].map(([value, bd, bl, fd, fl]) => ({ value, bg: pair(bd, bl), fg: pair(fd, fl) })),
    fallback: { bg: pair('#1f2733', '#e8edf2'), fg: pair('#9aa6b2', '#3d4753') } }),
  axeSide: cr('pill', { rules: [
    { value: 'Offer', bg: pair('#3a1818', '#fcdada'), fg: pair('#ee8e8e', '#7a1f1f') },
    { value: 'Bid', bg: pair('#103418', '#d6f4dd'), fg: pair('#7fdf9b', '#1f5d34') },
  ], fallback: { bg: pair('#1f2733', '#e8edf2'), fg: pair('#9aa6b2', '#3d4753') } }),
  oas: cr('heatmap', { domain: { min: 0, max: 600 },
    colorScale: { min: pair('#0f2b1c', '#e8f4ec'), mid: pair('#3a3010', '#fbf0cf'), max: pair('#3a1818', '#fcdada') },
    textColor: pair('#e8edf2', '#1f2733') }),
  zSpread: cr('heatmap', { domain: { min: 0, max: 600 },
    colorScale: { min: pair('#0f2b1c', '#e8f4ec'), mid: pair('#3a3010', '#fbf0cf'), max: pair('#3a1818', '#fcdada') },
    textColor: pair('#e8edf2', '#1f2733') }),
  unrealizedPnL: cr('pnl-value', {}), dailyPnL: cr('pnl-value', {}),
  priceChange: cr('trend-arrow', { threshold: 0, decimals: 4,
    upColor: pair('#7fdf9b', '#1f7a34'), downColor: pair('#ee8e8e', '#a02a2a'),
    neutralColor: pair('#9aa6b2', '#5a6068') }),
  activeWeightPct: cr('trend-arrow', { threshold: 0, decimals: 2,
    upColor: pair('#7fdf9b', '#1f7a34'), downColor: pair('#ee8e8e', '#a02a2a'),
    neutralColor: pair('#9aa6b2', '#5a6068') }),
  effectiveDuration: cr('percent-bar', { max: 30, showValue: true, barColor: pair('#7cc7f9', '#1e6fb8') }),
  inventoryAgeDays: cr('heatmap', { domain: { min: 0, max: 900 },
    colorScale: { min: pair('#0f2b1c', '#e8f4ec'), mid: pair('#3a3010', '#fbf0cf'), max: pair('#3a1818', '#fcdada') },
    textColor: pair('#e8edf2', '#1f2733') }),
};
const FORMATS = {
  marketValue: num(0), unrealizedPnL: num(0), dailyPnL: num(0), currentFace: num(0),
  axeSizeUsd: num(0), effectiveDv01: num(0), cs01: num(0),
  yieldToMaturity: num(3), yieldToWorst: num(3), couponRate: num(3), currentYield: num(3),
  zSpread: num(1), oas: num(1), avgCost: num(4), priceChange: num(4), bidAskPoints: num(4),
  effectiveDuration: num(2), modifiedDuration: num(2), spreadDuration: num(2),
  convexity: num(2), effectiveConvexity: num(2), weightedAverageLife: num(2),
  yearsToMaturity: num(2), factor: num(6),
  portfolioWeightPct: num(2), benchmarkWeightPct: num(2), activeWeightPct: num(2),
  krd2Y: num(0), krd5Y: num(0), krd10Y: num(0), krd30Y: num(0),
  bidPrice: num(4), askPrice: num(4),
};

// ─── the blotters ────────────────────────────────────────────────────────────
const IDENT = ['cusip', 'description'];
// A dealer's tail: what the desk is showing, how long it has been stuck with
// it, and what it is worth. Aged inventory is the number nobody else tracks.
const AXE = ['axeSide', 'axeSizeUsd', 'inventoryAgeDays', 'currentFace', 'marketValue', 'dailyPnL'];
// A fund's tail: the position IS the active weight, not the holding.
const WEIGHTS = ['portfolioWeightPct', 'benchmarkWeightPct', 'activeWeightPct',
  'currentFace', 'marketValue', 'unrealizedPnL'];

// A dealer blotter filters on the DESK and the book type. Both are needed: a
// fund's sector sleeve is also called "Securitized", so filtering on the desk
// alone pulled 177 fund holdings onto the dealer's inventory blotter.
const dealer = (desk) => ({
  desk: { filterType: 'set', values: [desk] },
  bookType: { filterType: 'set', values: ['Dealer'] },
});
const fund = (portfolio) => ({ portfolio: { filterType: 'set', values: [portfolio] } });

const BLOTTERS = [
  { id: 'fi-rates', name: 'Rates', caption: 'Rates — Govt & Agency',
    filter: dealer('Rates'),
    sort: [{ colId: 'yearsToMaturity', sort: 'asc' }],
    cols: [...IDENT, 'securityType', 'onTheRunRank', 'couponRate', 'maturityDate', 'yearsToMaturity',
      'quotedPrice', 'priceChange', 'bidAskPoints', 'yieldToMaturity', 'effectiveDuration',
      'effectiveDv01', 'krd2Y', 'krd5Y', 'krd10Y', 'krd30Y', ...AXE] },

  { id: 'fi-ig-credit', name: 'IG Credit', caption: 'IG Credit',
    filter: dealer('IG Credit'),
    sort: [{ colId: 'zSpread', sort: 'desc' }], group: ['sector'],
    cols: [...IDENT, 'issuerName', 'sector', 'rating', 'couponRate', 'maturityDate',
      'quotedPrice', 'yieldToMaturity', 'zSpread', 'oas', 'spreadDuration', 'cs01',
      'effectiveDuration', ...AXE] },

  { id: 'fi-hy-credit', name: 'HY Credit', caption: 'High Yield Credit',
    filter: dealer('HY Credit'),
    sort: [{ colId: 'zSpread', sort: 'desc' }],
    cols: [...IDENT, 'issuerName', 'sector', 'rating', 'couponRate', 'maturityDate',
      'quotedPrice', 'yieldToMaturity', 'yieldToWorst', 'workoutType', 'callable',
      'zSpread', 'oas', 'cs01', 'effectiveDuration', ...AXE] },

  { id: 'fi-munis', name: 'Munis', caption: 'Municipals',
    filter: dealer('Munis'),
    sort: [{ colId: 'yearsToMaturity', sort: 'asc' }],
    cols: [...IDENT, 'issuerName', 'rating', 'couponRate', 'maturityDate', 'yearsToMaturity',
      'quotedPrice', 'yieldToMaturity', 'yieldToWorst', 'workoutType', 'zSpread',
      'effectiveDuration', ...AXE] },

  { id: 'fi-securitized', name: 'Securitized', caption: 'Securitized Products',
    filter: dealer('Securitized'),
    sort: [{ colId: 'weightedAverageLife', sort: 'asc' }], group: ['assetClass'],
    cols: [...IDENT, 'assetClass', 'securityType', 'seniority', 'rating', 'factor',
      'weightedAverageLife', 'quotedPrice', 'oas', 'effectiveDuration',
      'effectiveConvexity', ...AXE] },

  { id: 'fi-cds', name: 'Credit Derivatives', caption: 'Flow CDS',
    filter: dealer('Credit Derivatives'),
    sort: [{ colId: 'cs01', sort: 'desc' }],
    // A swap is traded by NOTIONAL and direction, and quoted in points upfront
    // — market value is the mark, not the size, so face leads and MV follows.
    cols: [...IDENT, 'issuerName', 'rating', 'couponRate', 'maturityDate',
      'quotedPrice', 'zSpread', 'spreadDuration', 'cs01', ...AXE] },

  { id: 'fi-core-plus', name: 'Core Plus Bond', caption: 'Core Plus Bond Fund',
    filter: fund('Core Plus Bond'),
    sort: [{ colId: 'portfolioWeightPct', sort: 'desc' }], group: ['desk'],
    cols: [...IDENT, 'desk', 'assetClass', 'rating', 'couponRate', 'maturityDate',
      'quotedPrice', 'yieldToMaturity', 'effectiveDuration', 'effectiveDv01', ...WEIGHTS] },

  { id: 'fi-tax-exempt', name: 'Tax-Exempt Income', caption: 'Tax-Exempt Income Fund',
    filter: fund('Tax-Exempt Income'),
    sort: [{ colId: 'portfolioWeightPct', sort: 'desc' }],
    cols: [...IDENT, 'issuerName', 'rating', 'couponRate', 'maturityDate', 'yearsToMaturity',
      'quotedPrice', 'yieldToMaturity', 'yieldToWorst', 'effectiveDuration', ...WEIGHTS] },

  { id: 'fi-credit-opps', name: 'Credit Opportunities', caption: 'Credit Opportunities Fund',
    filter: fund('Credit Opportunities'),
    sort: [{ colId: 'activeWeightPct', sort: 'desc' }], group: ['desk'],
    cols: [...IDENT, 'desk', 'issuerName', 'sector', 'rating', 'maturityDate',
      'quotedPrice', 'yieldToMaturity', 'zSpread', 'cs01', 'effectiveDuration', ...WEIGHTS] },
];

// ─── build ───────────────────────────────────────────────────────────────────
const RULES = [
  { id: 'fi-tick-up', name: 'Price ticked up', enabled: true, priority: 5,
    scope: { type: 'cell', columns: ['quotedPrice', 'marketValue'] },
    expression: '[midPrice] > [midPrice.old]', activeDurationMs: 700,
    style: { dark: { color: '#4ade80' }, light: { color: '#15803d' } },
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'emerald', durationMs: 600 } },
  { id: 'fi-tick-down', name: 'Price ticked down', enabled: true, priority: 5,
    scope: { type: 'cell', columns: ['quotedPrice', 'marketValue'] },
    expression: '[midPrice] < [midPrice.old]', activeDurationMs: 700,
    style: { dark: { color: '#f87171' }, light: { color: '#b91c1c' } },
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'rose', durationMs: 600 } },
  { id: 'fi-losers', name: 'Unrealised loss', enabled: true, priority: 10,
    scope: { type: 'cell', columns: ['unrealizedPnL', 'dailyPnL'] }, expression: 'value < 0',
    style: { dark: { color: '#ee8e8e', fontWeight: '600' }, light: { color: '#a02a2a', fontWeight: '600' } } },
  // A dealer short is a real negative, and reads as one.
  { id: 'fi-short', name: 'Short inventory', enabled: true, priority: 15,
    scope: { type: 'cell', columns: ['currentFace', 'marketValue'] }, expression: '[currentFace] < 0',
    style: { dark: { color: '#f0a576', fontWeight: '600' }, light: { color: '#7a3b14', fontWeight: '600' } } },
  // Inventory nobody has been able to move. The desk is paying for it.
  { id: 'fi-aged', name: 'Aged inventory', enabled: true, priority: 18,
    scope: { type: 'cell', columns: ['inventoryAgeDays'] }, expression: 'value > 540',
    style: { dark: { backgroundColor: 'rgba(190,24,93,0.20)', color: '#f9a8d4' },
             light: { backgroundColor: 'rgba(190,24,93,0.12)', color: '#9d174d' } } },
  { id: 'fi-negative-convexity', name: 'Negatively convex', enabled: true, priority: 20,
    scope: { type: 'cell', columns: ['convexity', 'effectiveConvexity'] }, expression: 'value < 0',
    style: { dark: { backgroundColor: 'rgba(217,119,6,0.22)', color: '#fbbf24' },
             light: { backgroundColor: 'rgba(217,119,6,0.14)', color: '#92400e' } } },
];

function buildProfile(spec) {
  const cols = spec.cols.filter((f) => ALL_FIELDS.includes(f));
  const unknown = spec.cols.filter((f) => !ALL_FIELDS.includes(f));
  if (unknown.length) throw new Error(`${spec.id}: unknown columns ${unknown.join(', ')}`);
  const visible = new Set(cols);
  // Grouped-by columns must survive: AG Grid needs the column to exist even
  // when the group panel is what shows it.
  for (const g of spec.group ?? []) visible.add(g);

  const assignments = {};
  for (const field of visible) {
    const entry = { colId: field };
    if (HEADERS[field]) entry.headerName = HEADERS[field];
    if (RENDERERS[field]) Object.assign(entry, RENDERERS[field]);
    if (FORMATS[field]) entry.valueFormatterTemplate = FORMATS[field];
    assignments[field] = entry;
  }

  return {
    id: '__default__', gridId: 'star-demo-blotter', name: 'Default',
    createdAt: 1788834000000, updatedAt: 1788834000000,
    state: {
      'general-settings': { v: 4, data: {
        rowHeight: 26, headerHeight: 30, pagination: false, cellSelection: true,
        animateRows: false, cellFlashDuration: 500, cellFadeDuration: 1000,
        cellChangeFlashColor: 'amber', quickFilterText: '',
        rowGroupPanelShow: 'always', groupDefaultExpanded: 1,
        pivotMode: false, pivotPanelShow: 'never', suppressAggFuncInHeader: false,
      } },
      'column-customization': { v: 10, data: { assignments } },
      'conditional-styling': { v: 1, data: { rules: RULES } },
      'calculated-columns': { v: 1, data: { columns: [] } },
      'column-groups': { v: 1, data: { groups: [] } },
      alerts: { v: 1, data: { alerts: [] } },
      'grid-state': { v: 3, data: { schemaVersion: 3, savedAt: NOW, gridState: {
        version: '35.1.0',
        columnSizing: { columnSizingModel: [...visible].map((f) => ({ colId: f, width: W[f] ?? 110 })) },
        columnOrder: { orderedColIds: [...visible] },
        columnVisibility: { hiddenColIds: ALL_FIELDS.filter((f) => !visible.has(f)) },
        sort: { sortModel: spec.sort ?? [] },
        filter: { filterModel: spec.filter },
        ...(spec.group ? { rowGroup: { groupColIds: spec.group } } : {}),
        sideBar: { visible: false, openToolPanel: null, toolPanels: {} },
      } } },
    },
  };
}

const registry = seed.appConfig.find((c) => String(c.configId).startsWith('component-registry'));
// Idempotent: drop anything a previous run created, then rebuild.
const ids = new Set(BLOTTERS.flatMap((b) => [b.id, configIdOf(b.name)]));
seed.appConfig = seed.appConfig.filter((c) => !ids.has(c.configId));
registry.payload.entries = registry.payload.entries.filter((e) => !ids.has(e.configId) && !ids.has(e.id));

for (const spec of BLOTTERS) {
  const configId = configIdOf(spec.name);
  const subType = subTypeOf(spec.name);
  seed.appConfig.push({
    configId, appId: 'StarDemo', userId: 'k151344', isPublic: true,
    displayText: `MarketsGrid profiles: ${spec.name}`,
    // The template row's identity must MATCH the registry entry, or a
    // registered-component query will not find it: componentType 'grid',
    // its own subtype, isTemplate, and singleton set the same way.
    componentType: 'grid', componentSubType: subType,
    isTemplate: true, singleton: true,
    createdBy: 'k151344', updatedBy: 'k151344', creationTime: NOW, updatedTime: NOW,
    payload: { version: 1, profiles: [buildProfile(spec)], gridLevelData: { v: 1,
      provider: { liveProviderId: PROVIDER_ID, historicalProviderId: null, mode: 'live' },
      caption: spec.caption } },
  });
  // The FULL launchable shape. A registry entry carrying only componentType /
  // configId / displayName sits in the store and can never be opened: the
  // OpenFin launcher needs `id` and `hostUrl` to create a window at all.
  //
  // `singleton: true` is what makes the launcher reuse THIS config row —
  // `instanceId = singletonId ?? mint(...)`, and singletonId is the configId —
  // so the window opens on the seeded profile instead of cloning a fresh
  // template row. It also means launching Rates twice focuses one window
  // rather than opening a second, which is what a desk blotter should do.
  registry.payload.entries.push({
    id: configId,
    hostUrl: '/#/blotters/marketsgrid',
    // Without an icon the launcher renders a blank in the menu.
    iconId: 'lucide:table',
    componentType: 'grid',
    componentSubType: subType,
    configId,
    displayName: spec.name,
    createdAt: NOW,
    type: 'internal',
    usesHostConfig: true,
    appId: 'StarDemo',
    configServiceUrl: '',
    singleton: true,
    asWindow: true,
  });
}

/**
 * Dock buttons, filed under one dropdown.
 *
 * A registry entry is only reachable if something launches it. The platform
 * renders a default dock when no config is saved, but this seed HAS one, so a
 * blotter with no button in it simply cannot be opened — which is why nine
 * blotters existed and one appeared.
 *
 * They go in a group rather than nine top-level buttons: `addDockButton` files
 * blotters under "Assets", and a dock with a dozen loose icons is where a dock
 * stops being navigable.
 */
const dock = seed.appConfig.find((c) => c.configId === 'dock-config');
if (dock) {
  const GROUP = 'Assets';
  const uuid = (n) => `fi-dock-${n}`;
  const options = BLOTTERS.map((spec) => ({
    id: uuid(configIdOf(spec.name)),
    tooltip: spec.name,
    iconId: 'lucide:table',
    actionId: 'launch-component',
    customData: { registryEntryId: configIdOf(spec.name), asWindow: true },
  }));
  const others = (dock.payload.buttons ?? []).filter(
    (b) => !(b.type === 'DropdownButton' && String(b.tooltip).toLowerCase() === GROUP.toLowerCase()),
  );
  dock.payload.buttons = [
    ...others,
    { type: 'DropdownButton', id: uuid('assets'), tooltip: GROUP, iconUrl: '', iconId: 'lucide:folder', options },
  ];
  dock.payload.updatedAt = NOW;
}

writeFileSync(seedPath, JSON.stringify(seed, null, 2));
console.log(`${BLOTTERS.length} blotters written, ${dock ? 'dock group added' : 'NO DOCK CONFIG'}`);
for (const spec of BLOTTERS) {
  console.log(`  ${configIdOf(spec.name).padEnd(26)} ${String(spec.cols.length).padStart(2)} cols  ` +
    `filter=${Object.keys(spec.filter).join('+')}` +
    `${spec.group ? `  group=${spec.group.join(',')}` : ''}`);
}
