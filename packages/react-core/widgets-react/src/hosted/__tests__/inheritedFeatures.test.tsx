/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity rows 17-20 — snapshot/live-update lifecycle (17), grid-level
 * provider persistence (18), profile manager / settings sheet / dirty
 * dot (19), and admin-actions / headerExtras / gridLevelData
 * passthrough (20) all live in MarketsGridContainer + MarketsGrid.
 *
 * The wrapper's job is only to forward props; this single spec
 * verifies forwarding for the props those rows depend on. Behavioural
 * coverage lives in `@wellsfargo-starui/widgets-react`'s own
 * `markets-grid-container` tests and `@wellsfargo-starui/grid`'s
 * tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ConfigManager } from '@wellsfargo-starui/host-config';

const mgcProps: any[] = [];
vi.mock('../../container/markets-grid-container/index.js', () => ({
  MarketsGridContainer: (props: any) => {
    mgcProps.push(props);
    return <div data-testid="mds-stub" />;
  },
}));

const { HostedMarketsGrid } = await import('../HostedMarketsGrid.js');

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

afterEach(() => {
  cleanup();
  mgcProps.length = 0;
});

describe('HostedMarketsGrid — inherited features props passthrough (rows 17-20)', () => {
  it('forwards historicalDateAppDataRef, adminActions, headerExtras, defaultColDef and onError', async () => {
    const adminActions = [{ id: 'a1', label: 'A1', onSelect: vi.fn() }] as any;
    const headerExtras: ReactNode = <span data-testid="hx" />;
    const defaultColDef = { sortable: true, filter: true };
    const onError = vi.fn();

    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="if-1"
        defaultInstanceId="if-1"
        componentName="IF"
        configManager={fakeConfigManager}
        historicalDateAppDataRef="positions.asOfDate"
        adminActions={adminActions}
        headerExtras={headerExtras}
        defaultColDef={defaultColDef}
        onError={onError}
      />,
    );
    await waitFor(() => getByTestId('mds-stub'));
    const last = mgcProps[mgcProps.length - 1];
    expect(last.historicalDateAppDataRef).toBe('positions.asOfDate');
    expect(last.adminActions).toBe(adminActions);
    expect(last.headerExtras).toBe(headerExtras);
    expect(last.defaultColDef).toBe(defaultColDef);
    expect(last.onError).toBe(onError);
  });
});
