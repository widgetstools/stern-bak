/**
 * JSON-stringify a value for read-only display in the Inspector "Config" tab.
 * Functions (e.g. ag-grid valueFormatter/valueGetter on ColDefs) are not
 * serializable, so they render as a stable `[Function]` marker instead of
 * being dropped — the developer still sees that the column carries one.
 */
export function serializeConfig(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, val) => (typeof val === 'function' ? '[Function]' : val),
    2,
  );
}
