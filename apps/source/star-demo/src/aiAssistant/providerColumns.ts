/**
 * Derives a provider's `columnDefinitions` + `keyColumn` from sample rows.
 *
 * Why this exists: the grid builds its AG-Grid `columnDefs` from
 * `cfg.columnDefinitions` and its row identity from `cfg.keyColumn`. A
 * provider saved without them streams rows into a grid that has no columns —
 * which looks exactly like "no data". The Data Provider Editor avoids this by
 * making the user run Probe → Fields → select columns; anything creating a
 * provider programmatically has to do the same work.
 *
 * This mirrors the editor's pipeline (`useProviderProbe.ts` +
 * `buildColumns`/`mapType` in `provider-editor/tabs/FieldsTab.tsx`), selecting
 * every inferred leaf field instead of asking a human to tick boxes.
 */
import { probeMock, probeStomp, probeRest, inferFields, curatedColumns, mockDataset } from '@wellsfargo-starui/data';
import type {
  ColumnDefinition,
  MockProviderConfig,
  ProviderConfig,
  StompProviderConfig,
  RestProviderConfig,
} from '@wellsfargo-starui/types';

/** Shape of one node in `inferFields`' tree (mirrors the editor's FieldNode). */
export interface InferredField {
  path: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  children?: InferredField[];
}

/** Field names preferred as the row key, best first. */
const KEY_CANDIDATES = ['tradeId', 'positionId', 'orderId', 'cusip', 'id'];

function humanize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Inferred "date" fields come from ISO date-ish STRINGS, so they map to
 * AG-Grid's `dateString` — `date` expects real Date objects and would
 * mis-sort/mis-filter the string value. Same rule as the editor's `mapType`.
 */
function mapType(t: InferredField['type']): ColumnDefinition['cellDataType'] {
  if (t === 'date') return 'dateString';
  if (t === 'number' || t === 'boolean' || t === 'object') return t;
  return 'text';
}

/** Flattens the inferred tree to leaf fields (objects/arrays aren't columns). */
function leafFields(nodes: InferredField[]): InferredField[] {
  const out: InferredField[] = [];
  const walk = (list: InferredField[]) => {
    for (const n of list) {
      if (n.children?.length) walk(n.children);
      else if (n.type !== 'array' && n.type !== 'object') out.push(n);
    }
  };
  walk(nodes);
  return out;
}

function toColumn(n: InferredField): ColumnDefinition {
  return {
    field: n.path,
    headerName: humanize(n.name),
    cellDataType: mapType(n.type),
    filter: true,
    sortable: true,
    resizable: true,
  };
}

export function buildColumnDefinitions(fields: InferredField[]): ColumnDefinition[] {
  return leafFields(fields).map(toColumn);
}

/**
 * A live feed has no hand-curated catalogue the way mock does — nobody has
 * decided which of its fields a desk actually wants. Guessing at field NAMES
 * would be exactly the kind of invented-meaning mistake the rest of this file
 * (and `systemPrompt.ts`) refuses to make, so this curates structurally
 * instead: shallow (top-level) fields before nested ones, capped at a count
 * that reads as "a blotter", not a schema dump — same spirit as mock's
 * curated set, without pretending to know this feed's domain.
 */
export function suggestedColumns(fields: InferredField[], opts: { maxColumns?: number } = {}): ColumnDefinition[] {
  const maxColumns = opts.maxColumns ?? 40;
  const depth = (path: string) => (path.match(/\./g) ?? []).length;
  // A stable sort by depth alone preserves inferFields' own discovery order
  // within each depth, so ties don't reshuffle field order on every call.
  return leafFields(fields)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => depth(a.f.path) - depth(b.f.path) || a.i - b.i)
    .slice(0, maxColumns)
    .map(({ f }) => toColumn(f));
}

/**
 * Resolves explicit field paths against a live-inferred tree — the probed-feed
 * equivalent of `columnsForFields` (mock's catalogue lookup), same
 * found/`unknown` split so `set_provider_columns` can report an unrecognised
 * name instead of silently dropping it.
 */
export function columnsForPaths(
  fields: InferredField[],
  paths: string[],
): { columns: ColumnDefinition[]; unknown: string[] } {
  const byPath = new Map(leafFields(fields).map((f) => [f.path, f]));
  const columns: ColumnDefinition[] = [];
  const unknown: string[] = [];
  for (const path of paths) {
    const hit = byPath.get(path);
    if (hit) columns.push(toColumn(hit));
    else unknown.push(path);
  }
  return { columns, unknown };
}

export type ProbeAndInferResult =
  | { ok: true; fields: InferredField[]; rowsFetched: number; rowsUsed: number }
  | { ok: false; error: string };

/**
 * Probes a LIVE stomp/rest feed and infers its fields — the assistant's
 * equivalent of the Data Provider Editor's "Probe → Fields" button
 * (`useProviderProbe.ts`), called directly rather than through that React
 * hook: `probeStomp`/`probeRest`/`inferFields` are plain functions with no
 * dependency on it (see the package's own header comment: "pure main-thread
 * helpers"). Unlike `probeMock`, this genuinely dials a connection — it can
 * be slow or fail on a bad URL/unreachable feed, which callers surface as-is
 * rather than pretending inference always succeeds.
 */
export async function probeAndInferFields(
  config: ProviderConfig,
  opts: { sampleSize?: number } = {},
): Promise<ProbeAndInferResult> {
  const sampleSize = opts.sampleSize ?? 200;
  const probed =
    config.providerType === 'stomp'
      ? await probeStomp(config as StompProviderConfig, { maxRows: sampleSize })
      : config.providerType === 'rest'
        ? await probeRest(config as RestProviderConfig)
        : { ok: false as const, error: 'Field inference is only available for stomp and rest providers today.' };
  if (!probed.ok) return { ok: false, error: probed.error ?? 'Probe failed.' };
  const { fields, rowsUsed, rowsFetched } = inferFields(probed.rows as unknown[], { targetSampleSize: sampleSize }) as {
    fields: InferredField[];
    rowsUsed: number;
    rowsFetched: number;
  };
  return { ok: true, fields, rowsFetched, rowsUsed };
}

/**
 * Field catalog for a mock `dataType`, without creating anything.
 *
 * The model otherwise only learns a grid's fields from a BOUND provider's
 * saved `columnDefinitions`, which leaves it blind before a provider exists —
 * and guessing field names is the failure that produces rules and filters
 * which save cleanly and never match. `probeMock` is synchronous and offline,
 * so answering "what fields would a positions feed have?" costs nothing.
 */
export function describeMockFields(dataType: MockProviderConfig['dataType']): ColumnDefinition[] {
  const { rows } = probeMock({ providerType: 'mock', dataType } as MockProviderConfig, { maxRows: 50 });
  const { fields } = inferFields(rows as unknown[], { targetSampleSize: 50 }) as { fields: InferredField[] };
  return buildColumnDefinitions(fields);
}

export function pickKeyColumn(columns: ColumnDefinition[]): string | undefined {
  for (const candidate of KEY_CANDIDATES) {
    const hit = columns.find((c) => c.field === candidate || c.field.endsWith(`.${candidate}`));
    if (hit) return hit.field;
  }
  return columns[0]?.field;
}

/**
 * For mock providers, fills in `columnDefinitions`/`keyColumn` when absent.
 * `probeMock` is synchronous and offline, so this is cheap and can't fail on
 * connectivity. STOMP/REST providers need a live network probe — those are
 * left untouched and must be completed in the Data Provider Editor.
 */
export function withInferredColumns(config: ProviderConfig): ProviderConfig {
  if (config.providerType !== 'mock') return config;
  // `MockProviderConfig` doesn't DECLARE columnDefinitions (only stomp/rest
  // do), but MarketsGridContainer reads it off the active config through a
  // structural cast regardless of transport — and its render gate requires
  // the resulting columnDefs. So a mock carrying them works at runtime; we
  // widen the type here the same way the container does.
  const mock = config as MockProviderConfig & {
    columnDefinitions?: ColumnDefinition[];
    keyColumn?: string | readonly string[];
  };
  const hasColumns = (mock.columnDefinitions?.length ?? 0) > 0;
  if (hasColumns && mock.keyColumn) return config;

  try {
    const dataType = mock.dataType ?? 'positions';
    // The curated catalogue, not inference. Inferring over generated rows
    // returns EVERY field — 256 for positions — which is a schema dump, not a
    // blotter anyone would want to open. `curatedColumns` is the set a desk
    // would actually put on screen, already ordered and sized.
    const columnDefinitions = hasColumns ? mock.columnDefinitions! : curatedColumns(dataType);
    return {
      ...mock,
      columnDefinitions,
      // The catalogue knows each dataset's row identity; the hub silently drops
      // rows that don't resolve it, which surfaces as an empty grid.
      keyColumn: mock.keyColumn ?? mockDataset(dataType).keyColumn ?? pickKeyColumn(columnDefinitions),
    } as ProviderConfig;
  } catch (err) {
    // Never block provider creation on inference — a provider with no columns
    // is still editable by hand in the Data Provider Editor.
    console.warn('[aiAssistant] column inference failed — provider saved without columnDefinitions:', err);
    return config;
  }
}
