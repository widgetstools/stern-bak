/**
 * Grid options owned by explicit `MarketsGridSurface` / `AgGridReact` props.
 *
 * The module pipeline may emit these keys (general-settings owns
 * animateRows / sideBar / statusBar / heights / defaultColDef). When the
 * host ALSO passes the same key as a top-level MarketsGrid prop, pushing
 * it via `api.setGridOption` while AgGridReact receives it as a prop
 * makes the React adapter oscillate — the classic update-depth loop.
 *
 * When the host omits a key, pipeline output + post-mount sync are the
 * sole source of truth for that option.
 */

/** Always passed as explicit AgGridReact props — never spread from pipeline. */
export const SURFACE_FIXED_GRID_OPTION_KEYS = [
  'cellSelection',
  'maintainColumnOrder',
  'suppressNoRowsOverlay',
  'overlayNoRowsTemplate',
  'scrollbarWidth',
  'components',
  'onGridReady',
  'onGridPreDestroyed',
  'theme',
  'columnDefs',
  'rowData',
] as const;

/** Host may override pipeline output when provided on `MarketsGrid`. */
export const SURFACE_HOST_OVERRIDE_KEYS = [
  'rowHeight',
  'headerHeight',
  'animateRows',
  'sideBar',
  'statusBar',
  'defaultColDef',
] as const;

export type SurfaceHostOverrideKey = (typeof SURFACE_HOST_OVERRIDE_KEYS)[number];

export interface SurfaceHostOverrideInput {
  readonly rowHeight?: number;
  readonly headerHeight?: number;
  readonly animateRows?: boolean;
  readonly sideBar?: unknown;
  readonly statusBar?: unknown;
  readonly defaultColDef?: unknown;
}

/** Keys the host explicitly passed — pipeline must not fight these. */
export function resolveSurfaceHostOverrideKeys(
  input: SurfaceHostOverrideInput,
): ReadonlySet<string> {
  const keys = new Set<string>();
  if (input.rowHeight !== undefined) keys.add('rowHeight');
  if (input.headerHeight !== undefined) keys.add('headerHeight');
  if (input.animateRows !== undefined) keys.add('animateRows');
  if (input.sideBar !== undefined) keys.add('sideBar');
  if (input.statusBar !== undefined) keys.add('statusBar');
  if (input.defaultColDef !== undefined) keys.add('defaultColDef');
  return keys;
}

export function stripSurfaceManagedGridOptions(
  opts: Record<string, unknown>,
  hostOverrideKeys: ReadonlySet<string>,
): Record<string, unknown> {
  const out = { ...opts };
  for (const key of SURFACE_FIXED_GRID_OPTION_KEYS) {
    delete out[key];
  }
  for (const key of SURFACE_HOST_OVERRIDE_KEYS) {
    if (hostOverrideKeys.has(key)) delete out[key];
  }
  return out;
}

export function shouldSkipGridOptionSync(
  key: string,
  hostOverrideKeys: ReadonlySet<string>,
): boolean {
  if ((SURFACE_FIXED_GRID_OPTION_KEYS as readonly string[]).includes(key)) return true;
  return hostOverrideKeys.has(key);
}
