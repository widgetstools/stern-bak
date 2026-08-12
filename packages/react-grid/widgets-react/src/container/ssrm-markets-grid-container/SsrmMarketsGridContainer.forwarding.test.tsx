/**
 * Host-shell prop forwarding. star-demo's blotter needs gridId (keys stored
 * grid state), defaultColDef, historicalDateAppDataRef, onReady (colour-link
 * gridApi capture), onRowIdFieldChange / onProviderReady (hosted link
 * wiring), and onEditProvider / onOpenConfigBrowser (popouts) — all of which
 * the container previously dropped or hardcoded.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const captured = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));

const fakeProvider = vi.hoisted(() => ({
  getConfig: () => ({ keyColumn: 'positionId' }),
  getColumnDefs: () => [{ field: 'positionId' }],
  getSetFilterValues: vi.fn(async () => []),
}));

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

vi.mock('./useSsrmProviderDataWiring.js', () => ({
  useSsrmProviderDataWiring: () => ({ ready: true }),
}));

vi.mock('../markets-grid-container/ProviderEditorDialog.js', () => ({
  ProviderEditorDialog: ({ open }: { open: boolean }) =>
    open ? React.createElement('div', { 'data-testid': 'inline-editor' }) : null,
}));

import { SsrmMarketsGridContainer } from './SsrmMarketsGridContainer.js';

beforeEach(() => {
  captured.props = {};
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

  it('forwards onReady to MarketsGrid', async () => {
    const onReady = vi.fn();
    render(<SsrmMarketsGridContainer providerId="p1" onReady={onReady} />);
    await waitFor(() => expect(captured.props.onReady).toBe(onReady));
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

  it('routes the provider-editor entry to onEditProvider when supplied', async () => {
    const onEditProvider = vi.fn();
    render(
      <SsrmMarketsGridContainer providerId="p1" onEditProvider={onEditProvider} />,
    );
    const button = await screen.findByRole('button', { name: /edit provider/i });
    fireEvent.click(button);
    expect(onEditProvider).toHaveBeenCalledWith('p1');
    expect(screen.queryByTestId('inline-editor')).toBeNull();
  });

  it('opens the inline dialog when onEditProvider is not supplied', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    const button = await screen.findByRole('button', { name: /edit provider/i });
    fireEvent.click(button);
    expect(await screen.findByTestId('inline-editor')).toBeTruthy();
  });

  it('exposes a Config Browser admin action wired to onOpenConfigBrowser', async () => {
    const onOpenConfigBrowser = vi.fn();
    render(
      <SsrmMarketsGridContainer providerId="p1" onOpenConfigBrowser={onOpenConfigBrowser} />,
    );
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const actions = captured.props.adminActions as Array<{
      label: string;
      onClick: () => void;
    }>;
    const browser = actions.find((a) => /config browser/i.test(a.label));
    expect(browser).toBeDefined();
    browser!.onClick();
    expect(onOpenConfigBrowser).toHaveBeenCalledTimes(1);
  });
});
