/** True when the page is hosted inside an OpenFin runtime. */
export function isOpenFinRuntime(): boolean {
  return typeof globalThis !== 'undefined'
    && typeof (globalThis as { fin?: unknown }).fin !== 'undefined';
}
