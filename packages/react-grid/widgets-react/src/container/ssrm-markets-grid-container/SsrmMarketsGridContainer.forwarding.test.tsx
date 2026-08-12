/**
 * Host-shell prop forwarding. star-demo's blotter needs gridId (keys stored
 * grid state), defaultColDef, historicalDateAppDataRef, onReady (colour-link
 * gridApi capture), onRowIdFieldChange / onProviderReady (hosted link
 * wiring), and onEditProvider / onOpenConfigBrowser (popouts) — all of which
 * the container previously dropped or hardcoded.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const captured = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));

const fakeProvider = vi.hoisted(() => {
  const statusHandlers: Array<(s: string) => void> = [];
  return {
    getConfig: () => ({ keyColumn: 'positionId' }),
    getColumnDefs: () => [{ field: 'positionId' }],
    getSetFilterValues: vi.fn(async () => []),
    // Raw provider status stream — what the container's stale tracking
    // subscribes to (NOT the wiring hook's display-text onStatus).
    onStatus: (h: (s: string) => void) => {
      statusHandlers.push(h);
      return () => {
        const i = statusHandlers.indexOf(h);
        if (i >= 0) statusHandlers.splice(i, 1);
      };
    },
    emitStatus: (s: string) => [...statusHandlers].forEach((h) => h(s)),
  };
});

vi.mock('@wellsfargo-starui/grid', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    MarketsGrid: (props: Record<string, unknown>) => {
      captured.props = props;
      return React.createElement('div', { 'data-testid': 'markets-grid' });
    },
  };
});

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useSsrmDataProvider: () => ({ provider: fakeProvider, error: null }),
}));

const wiring = vi.hoisted(() => ({
  onStatus: null as ((s: string) => void) | null,
  params: [] as unknown[],
}));

vi.mock('./useSsrmProviderDataWiring.js', () => ({
  useSsrmProviderDataWiring: (params: { onStatus?: (s: string) => void }) => {
    wiring.onStatus = params.onStatus ?? null;
    wiring.params.push(params);
    return { ready: true };
  },
}));

vi.mock('../markets-grid-container/ProviderEditorDialog.js', () => ({
  ProviderEditorDialog: ({ open }: { open: boolean }) =>
    open ? React.createElement('div', { 'data-testid': 'inline-editor' }) : null,
}));

import { SsrmMarketsGridContainer } from './SsrmMarketsGridContainer.js';

beforeEach(() => {
  captured.props = {};
  wiring.params.length = 0;
});

describe('SsrmMarketsGridContainer prop forwarding', () => {
  // historicalDateAppDataRef is deliberately NOT forwarded: in CSRM it drives
  // MarketsGridContainer's historical-date subsystem (AppData + provider
  // restart), which has no SSRM counterpart yet. Deferred as its own feature.
  it('forwards gridId and defaultColDef to MarketsGrid', async () => {
    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        gridId="star-demo-blotter"
        defaultColDef={{ floatingFilter: true }}
      />,
    );
    await waitFor(() => expect(captured.props.gridId).toBe('star-demo-blotter'));
    expect(captured.props.defaultColDef).toMatchObject({ floatingFilter: true });
  });

  it('defaults gridId to providerId when omitted', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.gridId).toBe('p1'));
  });

  it('chains onReady to the caller (grid api captured for Refresh view first)', async () => {
    const onReady = vi.fn();
    render(<SsrmMarketsGridContainer providerId="p1" onReady={onReady} />);
    await waitFor(() => expect(captured.props.onReady).toBeDefined());
    const handle = { gridApi: { refreshServerSide: vi.fn() } };
    act(() => (captured.props.onReady as (h: unknown) => void)(handle));
    expect(onReady).toHaveBeenCalledWith(handle);
  });

  it('reports the resolved keyColumn through onRowIdFieldChange', async () => {
    const onRowIdFieldChange = vi.fn();
    render(
      <SsrmMarketsGridContainer providerId="p1" onRowIdFieldChange={onRowIdFieldChange} />,
    );
    await waitFor(() => expect(onRowIdFieldChange).toHaveBeenCalledWith('positionId'));
  });

  it('reports the live provider through onProviderReady', async () => {
    const onProviderReady = vi.fn();
    render(
      <SsrmMarketsGridContainer providerId="p1" onProviderReady={onProviderReady} />,
    );
    await waitFor(() => expect(onProviderReady).toHaveBeenCalledWith(fakeProvider));
  });

  it('routes the Data Provider Editor admin action to onEditProvider when supplied', async () => {
    const onEditProvider = vi.fn();
    render(
      <SsrmMarketsGridContainer providerId="p1" onEditProvider={onEditProvider} />,
    );
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const actions = captured.props.adminActions as Array<{
      id: string;
      onClick: () => void;
    }>;
    const editor = actions.find((a) => a.id === 'data-provider-editor');
    expect(editor).toBeDefined();
    editor!.onClick();
    expect(onEditProvider).toHaveBeenCalledWith('p1');
    expect(screen.queryByTestId('inline-editor')).toBeNull();
  });

  it('opens the inline dialog from the admin action when onEditProvider is not supplied', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const actions = captured.props.adminActions as Array<{
      id: string;
      onClick: () => void;
    }>;
    act(() => {
      actions.find((a) => a.id === 'data-provider-editor')!.onClick();
    });
    expect(await screen.findByTestId('inline-editor')).toBeTruthy();
  });

  it('prepends CSRM\'s refresh pair: Refresh view (cache) and Reload from source (restart)', async () => {
    const restart = vi.fn(async () => {});
    (fakeProvider as Record<string, unknown>).restart = restart;
    const refreshServerSide = vi.fn();
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const actions = captured.props.adminActions as Array<{
      id: string;
      onClick: () => void;
    }>;
    // Same ids and order as MarketsGridContainer's refresh/reload pair.
    expect(actions.map((a) => a.id).slice(0, 2)).toEqual([
      'refresh-view',
      'reload-from-source',
    ]);

    // Refresh view: purge blocks against the worker cache — no upstream I/O.
    act(() => {
      (captured.props.onReady as (h: unknown) => void)?.({
        gridApi: { refreshServerSide },
      });
    });
    act(() => actions[0].onClick());
    expect(refreshServerSide).toHaveBeenCalledWith({ purge: true });
    expect(restart).not.toHaveBeenCalled();

    // Reload from source: restart the provider; the ready transition then
    // auto-purges every subscribed grid via bindSsrmTicks.
    act(() => actions[1].onClick());
    expect(restart).toHaveBeenCalledWith(
      expect.objectContaining({ __refresh: expect.any(Number) }),
    );
  });

  it('drives the CSRM stale-data banner: error after ready sets dataStale, recovery clears it', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.dataStale).toBe(false));

    act(() => {
      fakeProvider.emitStatus('ready');
      fakeProvider.emitStatus('error');
    });
    await waitFor(() => expect(captured.props.dataStale).toBe(true));

    act(() => {
      fakeProvider.emitStatus('loading');
      fakeProvider.emitStatus('ready');
    });
    await waitFor(() => expect(captured.props.dataStale).toBe(false));
  });

  it('does not flag stale for errors before the first ready (cold connect retries)', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.dataStale).toBe(false));
    act(() => {
      fakeProvider.emitStatus('error');
    });
    expect(captured.props.dataStale).toBe(false);
  });

  it('keeps onStatus a stable reference across renders (unstable identity restarts the provider)', async () => {
    const { rerender } = render(<SsrmMarketsGridContainer providerId="p1" />);
    rerender(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(wiring.params.length).toBeGreaterThanOrEqual(2));
    const first = wiring.params[0] as { onStatus?: unknown };
    const last = wiring.params[wiring.params.length - 1] as { onStatus?: unknown };
    expect(first.onStatus).toBe(last.onStatus);
  });

  it('carries CSRM\'s exact menu pair when both callbacks are wired', async () => {
    const onOpenConfigBrowser = vi.fn();
    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        onEditProvider={vi.fn()}
        onOpenConfigBrowser={onOpenConfigBrowser}
      />,
    );
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const actions = captured.props.adminActions as Array<{
      id: string;
      label: string;
      onClick: () => void;
    }>;
    // Same ids, labels and order as MarketsGridContainer's data-infra menu.
    expect(actions.map((a) => [a.id, a.label]).slice(2)).toEqual([
      ['data-provider-editor', 'Data Provider Editor'],
      ['config-browser', 'Config Browser'],
    ]);
    actions[3].onClick();
    expect(onOpenConfigBrowser).toHaveBeenCalledTimes(1);
  });
});
