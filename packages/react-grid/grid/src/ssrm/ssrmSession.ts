import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { GridApi } from 'ag-grid-community';

export const SSRM_SESSION_KEY = '__ssrmSession' as const;

export interface SsrmGridSession {
  provider: ISsrmDataProvider;
}

type ApiWithSession = GridApi & { [SSRM_SESSION_KEY]?: SsrmGridSession };

export function isSsrmGrid(api: GridApi | null | undefined): boolean {
  if (!api) return false;
  try {
    return api.getGridOption?.('rowModelType') === 'serverSide';
  } catch {
    return false;
  }
}

export function attachSsrmSession(api: GridApi, provider: ISsrmDataProvider): void {
  (api as ApiWithSession)[SSRM_SESSION_KEY] = { provider };
}

export function detachSsrmSession(api: GridApi | null | undefined): void {
  if (!api) return;
  delete (api as ApiWithSession)[SSRM_SESSION_KEY];
}

export function getSsrmSession(api: GridApi | null | undefined): SsrmGridSession | undefined {
  if (!api) return undefined;
  return (api as ApiWithSession)[SSRM_SESSION_KEY];
}
