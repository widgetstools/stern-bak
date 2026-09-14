import { describe, expect, it } from 'vitest';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { GridApi } from 'ag-grid-community';
import {
  attachSsrmSession,
  detachSsrmSession,
  getSsrmSession,
  isSsrmGrid,
  SSRM_SESSION_KEY,
} from './ssrmSession.js';

describe('ssrmSession', () => {
  it('detects SSRM from rowModelType and survives a missing api', () => {
    expect(isSsrmGrid(null)).toBe(false);
    expect(isSsrmGrid({
      getGridOption: (k: string) => (k === 'rowModelType' ? 'clientSide' : undefined),
    } as unknown as GridApi)).toBe(false);
    expect(isSsrmGrid({
      getGridOption: (k: string) => (k === 'rowModelType' ? 'serverSide' : undefined),
    } as unknown as GridApi)).toBe(true);
    expect(isSsrmGrid({
      getGridOption: () => { throw new Error('dead'); },
    } as unknown as GridApi)).toBe(false);
  });

  it('attaches and detaches the provider on the api', () => {
    const api = {} as GridApi;
    const provider = { id: 'p' } as ISsrmDataProvider;
    attachSsrmSession(api, provider);
    expect(getSsrmSession(api)?.provider).toBe(provider);
    expect((api as unknown as Record<string, unknown>)[SSRM_SESSION_KEY]).toBeTruthy();
    detachSsrmSession(api);
    expect(getSsrmSession(api)).toBeUndefined();
    detachSsrmSession(null);
  });
});
