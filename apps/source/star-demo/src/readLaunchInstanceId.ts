/**
 * Registered-component instance id stamped on launch URLs by
 * `appendLaunchIdentityParams` (OpenFin workspace). Browser dev tabs
 * use the same query params when not launched from the registry.
 */
export function readLaunchInstanceId(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromInstanceId = params.get('instanceId');
    if (fromInstanceId && fromInstanceId.length > 0) return fromInstanceId;
    const fromId = params.get('id');
    if (fromId && fromId.length > 0) return fromId;
    return null;
  } catch {
    return null;
  }
}

export function isOpenFinHost(): boolean {
  return typeof (globalThis as { fin?: unknown }).fin !== 'undefined';
}
