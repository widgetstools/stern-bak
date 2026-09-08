/**
 * Semantic validation of the blotters and providers in `seed.json`.
 *
 * `validate-seed.mjs` checks the ENVELOPE — that the bundle has an app
 * registry, an active app and user. That is a shipping check, and it passes a
 * seed whose blotters cannot be opened, whose columns do not exist and whose
 * renderers draw nothing.
 *
 * This checks the things that actually break, every one of which broke here
 * first. They share a shape: a blotter is not one object, it is THREE that must
 * agree — a template config row, a component-registry entry, and a dock button
 * — and nothing in the type system relates them.
 *
 *   node scripts/validateBlotters.mjs
 *
 * Exit code 1 on any error. Warnings do not fail.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const seed = JSON.parse(readFileSync(join(root, 'public', 'seed.json'), 'utf8'));

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const rows = new Map((seed.appConfig ?? []).map((c) => [c.configId, c]));
const registry = (seed.appConfig ?? []).find((c) => String(c.configId).startsWith('component-registry'));
const entries = registry?.payload?.entries ?? [];
const dock = rows.get('dock-config');

/** Every registryEntryId a dock button or menu item launches. */
const dockTargets = new Map();
const walkButtons = (buttons) => {
  for (const b of buttons ?? []) {
    if (b.customData?.registryEntryId) dockTargets.set(b.customData.registryEntryId, b.customData);
    walkButtons(b.options);
  }
};
walkButtons(dock?.payload?.buttons);

// ── providers ───────────────────────────────────────────────────────────────
const providers = new Map(
  (seed.appConfig ?? [])
    .filter((c) => c.componentType === 'data-provider')
    .map((c) => [c.configId, c.payload]),
);
for (const [id, p] of providers) {
  const defs = p.columnDefinitions ?? [];
  if (defs.length === 0) err(`provider ${id}: no columnDefinitions`);
  const fields = defs.map((d) => d.field);
  const dupes = fields.filter((f, i) => fields.indexOf(f) !== i);
  if (dupes.length) err(`provider ${id}: duplicate column definitions: ${[...new Set(dupes)].join(', ')}`);
  const key = p.keyColumn;
  if (typeof key === 'string' && !fields.includes(key)) {
    err(`provider ${id}: keyColumn "${key}" is not among its columnDefinitions — the hub drops every row`);
  }
  // `projectFields` prunes incoming rows to these definitions BEFORE the hub
  // cache, so an undefined field is invisible to the assistant as well as the
  // grid. Worth stating rather than discovering.
  if (p.projectFields && defs.length < 20) {
    warn(`provider ${id}: projectFields is on with only ${defs.length} columns — anything not defined here never reaches the cache`);
  }
  if (p.providerType === 'stomp' && !/^wss?:\/\//.test(p.websocketUrl ?? '')) {
    err(`provider ${id}: websocketUrl "${p.websocketUrl}" is not a ws:// or wss:// URL`);
  }
}

// ── renderers that draw nothing without their config ────────────────────────
const REQUIRED_CONFIG = {
  pill: ['rules'],
  heatmap: ['colorScale'],
  'percent-bar': ['max', 'barColor'],
  'trend-arrow': ['upColor', 'downColor'],
  sparkline: ['variant', 'lineColor'],
  'multi-line': ['secondaryField'],
  'icon-text': ['iconSvg'],
  'rating-delta': ['scale', 'previousField', 'upColor', 'downColor'],
  'allocation-bar': ['segmentColorMap'],
};
const isThemePair = (v) => v && typeof v === 'object' && 'dark' in v && 'light' in v;

// ── blotters: the three-way agreement ───────────────────────────────────────
const gridEntries = entries.filter((e) => e.componentType === 'grid');
if (gridEntries.length === 0) warn('no grid entries in the component registry — nothing to open');

for (const e of gridEntries) {
  const label = e.configId ?? e.id ?? '(unnamed)';

  // 1. Launchable at all. An entry without id/hostUrl sits in the store and
  //    can never open a window.
  for (const field of ['id', 'hostUrl', 'componentType', 'componentSubType', 'configId', 'type']) {
    if (!e[field]) err(`blotter ${label}: registry entry is missing "${field}" — it cannot be launched`);
  }
  if (e.usesHostConfig !== true) warn(`blotter ${label}: usesHostConfig is not true`);
  if (!e.iconId) warn(`blotter ${label}: no iconId — the launcher renders a blank menu row`);

  // 2. The id convention `deriveTemplateConfigId` builds and the platform
  //    resolves templates by.
  const derived = `${e.componentType}-${e.componentSubType}`.toLowerCase();
  if (e.id !== e.configId) err(`blotter ${label}: registry id "${e.id}" !== configId "${e.configId}"`);
  if (e.configId !== derived) {
    err(`blotter ${label}: configId should be "${derived}" (componentType-componentSubType)`);
  }

  // 3. The template row exists and agrees with the entry.
  const row = rows.get(e.configId);
  if (!row) { err(`blotter ${label}: no appConfig row — the window opens unconfigured`); continue; }
  if (row.componentType !== e.componentType || row.componentSubType !== e.componentSubType) {
    err(`blotter ${label}: row identity (${row.componentType}/${row.componentSubType}) does not match the entry (${e.componentType}/${e.componentSubType})`);
  }
  if (Boolean(row.singleton) !== Boolean(e.singleton)) {
    err(`blotter ${label}: singleton disagrees — row ${Boolean(row.singleton)}, entry ${Boolean(e.singleton)}`);
  }
  if (row.isTemplate !== true) err(`blotter ${label}: row is not marked isTemplate — the launcher clones from it`);

  // 4. Something has to launch it.
  const target = dockTargets.get(e.id);
  if (!target) {
    err(`blotter ${label}: no dock button targets it — the seed has a dock config, so it can never be opened`);
  } else if (e.asWindow === true && target.asWindow !== true) {
    err(`blotter ${label}: entry says asWindow but its dock button launches a docked view`);
  }

  // 5. Its provider exists, and its columns are real.
  const providerId = row.payload?.gridLevelData?.provider?.liveProviderId;
  if (!providerId) { warn(`blotter ${label}: no live provider bound`); continue; }
  const provider = providers.get(providerId);
  if (!provider) { err(`blotter ${label}: provider "${providerId}" is not in the seed`); continue; }
  const fields = new Set((provider.columnDefinitions ?? []).map((d) => d.field));

  const profile = row.payload?.profiles?.[0];
  if (!profile?.state) { warn(`blotter ${label}: no authored profile`); continue; }
  const st = profile.state;
  const gs = st['grid-state']?.data?.gridState ?? {};

  const referenced = new Map();
  const note = (where, ids) => { for (const c of ids ?? []) referenced.set(c, where); };
  note('columnOrder', gs.columnOrder?.orderedColIds);
  note('columnVisibility', gs.columnVisibility?.hiddenColIds);
  note('columnSizing', (gs.columnSizing?.columnSizingModel ?? []).map((c) => c.colId));
  note('sort', (gs.sort?.sortModel ?? []).map((c) => c.colId));
  note('rowGroup', gs.rowGroup?.groupColIds);
  note('filter', Object.keys(gs.filter?.filterModel ?? {}));
  note('assignments', Object.keys(st['column-customization']?.data?.assignments ?? {}));
  for (const r of st['conditional-styling']?.data?.rules ?? []) note(`rule "${r.id}"`, r.scope?.columns);

  for (const [col, where] of referenced) {
    if (!fields.has(col)) err(`blotter ${label}: ${where} references column "${col}", which ${providerId} does not define`);
  }

  // 6. Renderers that silently render plain text when under-configured.
  for (const [col, a] of Object.entries(st['column-customization']?.data?.assignments ?? {})) {
    const kind = a.cellRendererId;
    if (!kind) continue;
    const cfg = a.cellRendererConfig?.config ?? {};
    if (a.cellRendererConfig && a.cellRendererConfig.kind !== kind) {
      err(`blotter ${label}: ${col} cellRendererConfig.kind "${a.cellRendererConfig.kind}" != cellRendererId "${kind}"`);
    }
    for (const need of REQUIRED_CONFIG[kind] ?? []) {
      if (cfg[need] === undefined) {
        err(`blotter ${label}: ${col} uses "${kind}" without "${need}" — the cell falls back to plain text and says nothing`);
      }
    }
    // Profile data is written into .xlsx by the Visual Excel path, where a CSS
    // variable cannot resolve, so colours must carry both themes.
    for (const [k, v] of Object.entries(cfg)) {
      if (/color/i.test(k) && v && typeof v === 'object' && !isThemePair(v) && !('min' in v)) {
        warn(`blotter ${label}: ${col} ${kind}.${k} is not a {dark, light} pair`);
      }
    }
  }

  // 7. Styling rules: flash/indicator/activeDurationMs are TOP-LEVEL. Nested
  //    inside `style` they parse, save, and paint nothing.
  for (const r of st['conditional-styling']?.data?.rules ?? []) {
    if (!r.id || !r.expression || !r.scope) err(`blotter ${label}: rule ${r.id ?? '(no id)'} is missing id, expression or scope`);
    for (const key of ['flash', 'indicator', 'animation', 'activeDurationMs']) {
      if (r.style && key in r.style) {
        err(`blotter ${label}: rule "${r.id}" nests "${key}" inside style — it must be top-level or it paints nothing`);
      }
    }
    if (r.style && !(r.style.dark && r.style.light)) {
      warn(`blotter ${label}: rule "${r.id}" does not define both dark and light`);
    }
  }
}

// Registry entries pointing at rows that are not grids, and orphan rows.
for (const [id, row] of rows) {
  if (row.componentType !== 'grid' || !row.isTemplate) continue;
  if (!gridEntries.some((e) => e.configId === id)) {
    warn(`orphan template row "${id}": no registry entry, so it never appears in the launcher`);
  }
}

for (const w of warnings) console.warn(`[validate-blotters] warn  ${w}`);
for (const e of errors) console.error(`[validate-blotters] ERROR ${e}`);
console.log(
  `[validate-blotters] ${gridEntries.length} blotters, ${providers.size} providers, ` +
  `${dockTargets.size} dock targets — ${errors.length} errors, ${warnings.length} warnings`,
);
process.exit(errors.length > 0 ? 1 : 0);
