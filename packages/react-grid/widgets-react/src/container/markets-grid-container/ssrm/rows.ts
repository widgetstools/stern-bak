/** Row path column Perspective adds to the output of a grouped view. */
export const ROW_PATH = '__ROW_PATH__';

/**
 * Where the datasource stamps the identity of a group row. Leaf rows are
 * identified by the table's index column instead, so `getRowId` reads this
 * first and falls back to the index.
 */
export const ROW_ID_FIELD = '__pspRowId';

/** Identity of the total row pivot mode shows when nothing is row-grouped. */
export const TOTAL_ROW_ID = 'psp-total';

/**
 * Number of leaf rows beneath a group row, which is what AG Grid shows as
 * "(N)" beside the group name. Computed by the engine rather than counted by
 * the grid, which only ever holds a block of the level.
 */
export const CHILD_COUNT_FIELD = '__pspChildCount';

export type Columnar = Record<string, unknown[]>;

/** A control character, so it cannot collide with anything in a group key. */
const GROUP_ID_SEPARATOR = '';

/**
 * A group key rendered so that two different keys never collide.
 *
 * `String(key)` is not enough: a null and the literal string `"null"` are
 * different groups that stringify identically, which would give them the same
 * row id and so break selection, expansion and flashing for the pair. Tagging
 * with the type keeps them apart, and lets a number-keyed level be matched
 * against a number rather than against its own decimal rendering.
 */
export function groupKeyToken(key: unknown): string {
  if (key === null || key === undefined) return 'n';
  if (typeof key === 'string') return `s${key}`;
  if (typeof key === 'number') return `f${key}`;
  if (typeof key === 'boolean') return `b${key ? 1 : 0}`;
  if (key instanceof Date) return `d${key.getTime()}`;
  return `o${String(key)}`;
}

export function rowIdForGroup(route: readonly unknown[], key: unknown): string {
  const path = [...route, key].map(groupKeyToken);
  return `g${GROUP_ID_SEPARATOR}${path.join(GROUP_ID_SEPARATOR)}`;
}

/** Identity of a level within the tree, used to bucket rows by their group. */
export function routeKey(level: number, route: readonly unknown[]): string {
  return `${level}${GROUP_ID_SEPARATOR}${route.map(groupKeyToken).join(GROUP_ID_SEPARATOR)}`;
}

function dataKeysOf(columns: Columnar): string[] {
  return Object.keys(columns).filter((name) => name !== ROW_PATH);
}

type RowFactory = (columns: Columnar) => Record<string, unknown>[];
const factories = new Map<string, RowFactory | null>();

/*
 * Building a row by assigning many properties one at a time gives every row a
 * dictionary-mode object, and does it per block row. Compiling the same work
 * into a single object literal — once per column set, then cached — gives
 * every row one shared hidden class instead, which is several times faster to
 * build and cheaper for the cell renderers to read afterwards.
 *
 * `new Function` is unavailable under a strict Content-Security-Policy, so a
 * failure to compile falls back to the straightforward loop.
 */
function rowFactoryFor(keys: string[]): RowFactory | null {
  const cacheKey = keys.join('');
  const cached = factories.get(cacheKey);
  if (cached !== undefined) return cached;
  let factory: RowFactory | null = null;
  try {
    const locals = keys.map((key, i) => `const c${i}=columns[${JSON.stringify(key)}];`).join('');
    const literal = keys.map((key, i) => `${JSON.stringify(key)}:c${i}[i]`).join(',');
    factory = new Function(
      'columns',
      `${locals}const n=c0?c0.length:0;const out=new Array(n);` +
        `for(let i=0;i<n;i++){out[i]={${literal}}}return out`,
    ) as RowFactory;
  } catch {
    factory = null;
  }
  factories.set(cacheKey, factory);
  return factory;
}

/**
 * Perspective serialises a view column-first; AG Grid wants one object per row.
 * Under a `split_by` the keys are already the pivot result fields the grid asked
 * for, so they are copied across as they are.
 */
export function mapLeafRows(columns: Columnar): Record<string, unknown>[] {
  const keys = dataKeysOf(columns);
  if (keys.length === 0) return [];
  const factory = rowFactoryFor(keys);
  if (factory) return factory(columns);
  const length = columns[keys[0]].length;
  const rows = new Array<Record<string, unknown>>(length);
  for (let i = 0; i < length; i++) {
    const row: Record<string, unknown> = {};
    for (const key of keys) row[key] = columns[key][i];
    rows[i] = row;
  }
  return rows;
}

/**
 * Group rows for one level. A `"flat"` rollup emits one row path per child, each
 * holding only that child's own key, so the key is the whole of `path[0]` and
 * there is no level total to skip past.
 */
export function mapGroupRows(
  columns: Columnar,
  groupColumn: string,
  route: readonly unknown[],
): Record<string, unknown>[] {
  const paths = columns[ROW_PATH] as unknown[][] | undefined;
  const keys = dataKeysOf(columns);
  const length = paths?.length ?? 0;

  const rows = new Array<Record<string, unknown>>(length);
  for (let i = 0; i < length; i++) {
    const key = paths?.[i]?.[0] ?? null;
    const row: Record<string, unknown> = { [ROW_ID_FIELD]: rowIdForGroup(route, key) };

    for (const name of keys) row[name] = columns[name][i];

    /*
     * The group key is written last on purpose. A column can be in both Row
     * Groups and Values at once, and then the aggregate arrives under the same
     * name — overwriting the key would leave the group row showing a total
     * where its name belongs, and would corrupt every drill-down beneath it,
     * because AG Grid derives the next request's `groupKeys` from what it sees.
     */
    row[groupColumn] = key;
    rows[i] = row;
  }
  return rows;
}

/** The single aggregate row of a `"total"` rollup. */
export function mapTotalRow(columns: Columnar, rowId?: string): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (rowId) row[ROW_ID_FIELD] = rowId;
  for (const key of dataKeysOf(columns)) row[key] = columns[key][0];
  return row;
}
