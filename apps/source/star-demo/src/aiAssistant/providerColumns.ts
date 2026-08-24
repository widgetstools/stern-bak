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
import { probeMock, inferFields } from '@wellsfargo-starui/data';
import type { ColumnDefinition, MockProviderConfig, ProviderConfig } from '@wellsfargo-starui/types';

/** Shape of one node in `inferFields`' tree (mirrors the editor's FieldNode). */
interface InferredField {
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

export function buildColumnDefinitions(fields: InferredField[]): ColumnDefinition[] {
  return leafFields(fields).map((n) => ({
    field: n.path,
    headerName: humanize(n.name),
    cellDataType: mapType(n.type),
    filter: true,
    sortable: true,
    resizable: true,
  }));
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
    const { rows } = probeMock(mock, { maxRows: 50 });
    const { fields } = inferFields(rows as unknown[], { targetSampleSize: 50 }) as { fields: InferredField[] };
    const columnDefinitions = hasColumns ? mock.columnDefinitions! : buildColumnDefinitions(fields);
    return {
      ...mock,
      columnDefinitions,
      keyColumn: mock.keyColumn ?? pickKeyColumn(columnDefinitions),
    } as ProviderConfig;
  } catch (err) {
    // Never block provider creation on inference — a provider with no columns
    // is still editable by hand in the Data Provider Editor.
    console.warn('[aiAssistant] column inference failed — provider saved without columnDefinitions:', err);
    return config;
  }
}
