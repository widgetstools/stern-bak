/**
 * `gridOptions` is spread onto AgGridReact, so anything SSRM sets internally
 * can be overwritten by a caller. `onGridReady` is where the datasource and
 * the live-tick subscription get attached — losing it leaves a grid that
 * renders fine and never receives data, with no error anywhere.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

const { capturedProps, api, createSsrmDatasource, bindSsrmTicks } = vi.hoisted(() => {
  const capturedProps: Record<string, unknown>[] = [];
  const api = { setGridOption: vi.fn(), isDestroyed: () => false };
  const createSsrmDatasource = vi.fn(() => ({ getRows: vi.fn() }));
  const bindSsrmTicks = vi.fn(() => () => {});
  return { capturedProps, api, createSsrmDatasource, bindSsrmTicks };
});

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: Record<string, unknown>) => {
    capturedProps.push(props);
    React.useEffect(() => {
      (props.onGridReady as ((e: unknown) => void) | undefined)?.({ api });
    }, []);
    return React.createElement('div', { 'data-testid': 'ag-ssrm' });
  },
}));

vi.mock('ag-grid-enterprise', () => ({ AllEnterpriseModule: {} }));
vi.mock('./createSsrmDatasource.js', () => ({ createSsrmDatasource }));
vi.mock('./bindSsrmTicks.js', () => ({ bindSsrmTicks }));
vi.mock('./createSsrmStatusBar.js', () => ({
  createSsrmStatusBar: () => ({ statusBar: { statusPanels: [] }, context: {} }),
}));

import { SsrmAgGrid } from './SsrmAgGrid.js';

const provider = {
  getConfig: () => ({ blockSize: 100 }),
  getRows: vi.fn(),
  setViewport: vi.fn(),
  onSsrmTick: vi.fn(() => () => {}),
} as never;

beforeEach(() => {
  capturedProps.length = 0;
  createSsrmDatasource.mockClear();
  bindSsrmTicks.mockClear();
  api.setGridOption.mockClear();
});

describe('SsrmAgGrid gridOptions merging', () => {
  it('still installs the datasource when a caller passes onGridReady in gridOptions', async () => {
    const callerOnGridReady = vi.fn();

    render(
      <SsrmAgGrid
        provider={provider}
        columnDefs={[]}
        gridOptions={{ onGridReady: callerOnGridReady } as never}
      />,
    );

    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalled());
    expect(bindSsrmTicks).toHaveBeenCalled();
    // The caller's handler must still run — protected, not discarded.
    expect(callerOnGridReady).toHaveBeenCalled();
  });

  it('keeps rowModelType serverSide even if gridOptions says otherwise', async () => {
    render(
      <SsrmAgGrid
        provider={provider}
        columnDefs={[]}
        gridOptions={{ rowModelType: 'clientSide' } as never}
      />,
    );

    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    expect(capturedProps.at(-1)?.rowModelType).toBe('serverSide');
  });

  it('keeps the SSRM getRowId that live ticks depend on', async () => {
    const callerGetRowId = vi.fn(() => 'nope');

    render(
      <SsrmAgGrid
        provider={provider}
        columnDefs={[]}
        keyColumn="id"
        gridOptions={{ getRowId: callerGetRowId } as never}
      />,
    );

    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    const getRowId = capturedProps.at(-1)?.getRowId as (p: unknown) => string;
    expect(getRowId({ data: { id: 'abc' } })).toBe('abc');
    expect(callerGetRowId).not.toHaveBeenCalled();
  });

  it('still applies harmless caller options', async () => {
    render(
      <SsrmAgGrid
        provider={provider}
        columnDefs={[]}
        gridOptions={{ rowHeight: 42 } as never}
      />,
    );

    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    expect(capturedProps.at(-1)?.rowHeight).toBe(42);
  });
});
