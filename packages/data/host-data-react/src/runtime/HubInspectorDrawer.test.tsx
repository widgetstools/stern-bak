import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConfigManager } from '@wellsfargo-starui/host-config';
import type {
  DataServices,
  HubIntrospectSnapshot,
  HubProviderIntrospectRow,
} from '@wellsfargo-starui/host-data/runtime';
import { DataServicesProvider } from './DataServicesProvider.js';
import { HubInspectorDrawer } from './HubInspectorDrawer.js';

/**
 * The drawer is the operator's read-only view of the SharedWorker hub. What
 * matters is that it polls while open, stops when closed, surfaces a failed
 * introspect instead of showing stale numbers as if they were live, and lets
 * a row be expanded to reveal the worker-loaded cfg.
 *
 * jsdom sizes everything at zero, so the virtualised sections need an
 * explicit viewport (see HubInspectorVirtualSection.render.test.tsx).
 */

const getHubIntrospect = vi.fn();

function provider(overrides: Partial<HubProviderIntrospectRow> = {}): HubProviderIntrospectRow {
  return {
    providerId: 'positions',
    name: 'Positions feed',
    providerType: 'stomp',
    running: true,
    status: 'ready',
    subscriberCount: 3,
    rowCount: 1200,
    cfg: { providerType: 'stomp', url: 'ws://feed' },
    ...overrides,
  } as HubProviderIntrospectRow;
}

function snapshot(overrides: Partial<HubIntrospectSnapshot> = {}): HubIntrospectSnapshot {
  return {
    connectedPorts: 2,
    catalogReady: true,
    catalogProviderCount: 4,
    runningProviderCount: 1,
    providers: [provider()],
    appData: {
      listenerCount: 5,
      rows: [{ configId: 'ad-1', name: 'session', keyCount: 2, values: { asOfDate: '2026-07-01' } }],
    },
    ...overrides,
  };
}

const services: DataServices = {
  client: { getHubIntrospect, invalidateConfig: vi.fn() } as unknown as DataServices['client'],
  appData: {
    ready: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => () => undefined),
    list: vi.fn(() => []),
  } as unknown as DataServices['appData'],
  configManager: { getAppId: () => 'star-demo' } as unknown as ConfigManager,
  ready: Promise.resolve(),
  dispose: vi.fn(),
};

function renderDrawer(open = true, onOpenChange = vi.fn()) {
  return {
    onOpenChange,
    ...render(
      <DataServicesProvider services={services} userId="k123">
        <HubInspectorDrawer open={open} onOpenChange={onOpenChange} />
      </DataServicesProvider>,
    ),
  };
}

function stubSize(prop: 'offsetWidth' | 'offsetHeight', value: number) {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, value });
  return () => { if (original) Object.defineProperty(HTMLElement.prototype, prop, original); };
}

let restore: Array<() => void> = [];

/**
 * vaul's drag handling calls the Pointer Capture API, which jsdom does not
 * implement — without these the pointer events userEvent emits reject
 * asynchronously and surface as unhandled errors.
 */
function stubPointerCapture() {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  const saved = {
    setPointerCapture: proto.setPointerCapture,
    releasePointerCapture: proto.releasePointerCapture,
    hasPointerCapture: proto.hasPointerCapture,
  };
  proto.setPointerCapture = () => undefined;
  proto.releasePointerCapture = () => undefined;
  proto.hasPointerCapture = () => false;
  return () => { Object.assign(proto, saved); };
}

beforeEach(() => {
  getHubIntrospect.mockReset().mockResolvedValue(snapshot());
  restore = [stubSize('offsetWidth', 600), stubSize('offsetHeight', 400), stubPointerCapture()];
});

afterEach(() => {
  restore.forEach((fn) => fn());
  cleanup();
  vi.useRealTimers();
});

describe('HubInspectorDrawer', () => {
  it('reads the hub once opened and shows the summary counts', async () => {
    renderDrawer();

    await waitFor(() => expect(getHubIntrospect).toHaveBeenCalled());
    const summary = await screen.findByRole('region', { name: 'Hub summary' });

    expect(within(summary).getByText('2')).toBeDefined();          // connected ports
    expect(within(summary).getByText('ready')).toBeDefined();      // catalog state
    expect(within(summary).getByText('1 running / 4 catalog')).toBeDefined();
    expect(within(summary).getByText('1,200')).toBeDefined();      // cached rows
    expect(within(summary).getByText('5')).toBeDefined();          // AppData listeners
  });

  it('does not touch the hub while closed', () => {
    renderDrawer(false);
    // Polling a closed panel would keep the SharedWorker serialising its
    // entire state once a second for nobody.
    expect(getHubIntrospect).not.toHaveBeenCalled();
  });

  it('renders an em dash for counters the hub did not report', async () => {
    getHubIntrospect.mockResolvedValue(
      snapshot({ connectedPorts: undefined as unknown as number, catalogReady: false }),
    );
    renderDrawer();

    const summary = await screen.findByRole('region', { name: 'Hub summary' });
    expect(within(summary).getByText('—')).toBeDefined();
    expect(within(summary).getByText('pending')).toBeDefined();
  });

  it('shows the failure message rather than leaving stale numbers on screen', async () => {
    getHubIntrospect.mockRejectedValue(new Error('worker port closed'));
    renderDrawer();

    expect(await screen.findByText('worker port closed')).toBeDefined();
  });

  it('stringifies a non-Error rejection', async () => {
    getHubIntrospect.mockRejectedValue('port gone');
    renderDrawer();

    expect(await screen.findByText('port gone')).toBeDefined();
  });

  it('re-reads the hub when the refresh button is pressed', async () => {
    renderDrawer();
    await waitFor(() => expect(getHubIntrospect).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => expect(getHubIntrospect).toHaveBeenCalledTimes(2));
  });

  it('lists providers with their live subscriber and row counts', async () => {
    renderDrawer();

    const row = (await screen.findByText('Positions feed')).closest('tr')!;
    expect(within(row).getByText('positions')).toBeDefined();
    expect(within(row).getByText('stomp')).toBeDefined();
    expect(within(row).getByText('ready')).toBeDefined();
    expect(within(row).getByText('3')).toBeDefined();
    expect(within(row).getByText('1,200')).toBeDefined();
  });

  it('shows an idle badge and dashes for a catalog row with no runtime slot', async () => {
    getHubIntrospect.mockResolvedValue(
      snapshot({ providers: [provider({ running: false, status: undefined })], runningProviderCount: 0 }),
    );
    renderDrawer();

    expect(await screen.findByText('idle')).toBeDefined();
    // Subscriber/row counts belong to a running provider; showing 0 would
    // read as "running but nobody attached".
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('expands a provider row to reveal the worker-loaded cfg, and collapses again', async () => {
    renderDrawer();

    const row = (await screen.findByText('Positions feed')).closest('tr')!;
    await userEvent.click(row);

    const cfg = await screen.findByText('Runtime provider cfg');
    expect(cfg).toBeDefined();
    expect(screen.getByText(/ws:\/\/feed/)).toBeDefined();

    await userEvent.click(row);
    await waitFor(() => expect(screen.queryByText('Runtime provider cfg')).toBeNull());
  });

  it('labels an idle provider’s cfg as the cached catalog copy', async () => {
    getHubIntrospect.mockResolvedValue(snapshot({ providers: [provider({ running: false })] }));
    renderDrawer();

    const row = (await screen.findByText('Positions feed')).closest('tr')!;
    await userEvent.click(row);

    expect(await screen.findByText('Catalog provider cfg')).toBeDefined();
  });

  it('does not expand a provider the hub has no cfg for', async () => {
    getHubIntrospect.mockResolvedValue(snapshot({ providers: [provider({ cfg: undefined })] }));
    renderDrawer();

    const row = (await screen.findByText('Positions feed')).closest('tr')!;
    await userEvent.click(row);

    await waitFor(() => expect(screen.queryByText(/provider cfg$/)).toBeNull());
  });

  it('expands an AppData row to reveal its values', async () => {
    renderDrawer();

    const row = (await screen.findByText('session')).closest('tr')!;
    await userEvent.click(row);

    expect(await screen.findByText('AppData values')).toBeDefined();
    expect(screen.getByText(/2026-07-01/)).toBeDefined();
  });

  it('shows the empty states when the hub has nothing loaded', async () => {
    getHubIntrospect.mockResolvedValue(
      snapshot({ providers: [], appData: { listenerCount: 0, rows: [] } }),
    );
    renderDrawer();

    expect(await screen.findByText('No providers in catalog or runtime')).toBeDefined();
    expect(screen.getByText('No AppData rows loaded')).toBeDefined();
  });

  it('keeps polling on an interval while open, and stops on close', async () => {
    const setInterval = vi.spyOn(window, 'setInterval');
    const clearInterval = vi.spyOn(window, 'clearInterval');

    const { unmount } = renderDrawer();
    await waitFor(() => expect(getHubIntrospect).toHaveBeenCalled());
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);

    unmount();
    expect(clearInterval).toHaveBeenCalled();
  });
});
