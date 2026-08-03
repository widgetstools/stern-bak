/**
 * MarketsGridContainer — the row engine a provider gets.
 *
 * The container is the only place that knows both the selected provider and
 * this window's data-services client, so it is the only place that can turn a
 * `*-perspective` provider into the props the grid's engine layer reads.
 *
 * Two things are asserted here that a passing grid would not reveal on its
 * own: a classic provider must reach MarketsGrid with NO rowModel at all (not
 * `'client'` — absent, exactly as before this path existed), and a Perspective
 * provider must keep `applyProviderToGrid` off its path entirely, since
 * `applyTransactionAsync` tick classification is a client-side row model's
 * write path and means nothing under a server-side one.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@wellsfargo-starui/core';

const PROVIDER_ID = 'dp-perspective';

const lastMarketsGridProps: { current: any } = { current: null };

vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: any) => {
    lastMarketsGridProps.current = props;
    // The real grid reports its api through `onReady`, and the container gates
    // its client-side data wiring on having one. Without that call here, the
    // classic path would look un-wired for the wrong reason. Deferred a task,
    // because AG Grid's own `onGridReady` lands well after mount — and the
    // container stamps the api against a ref its parent effect writes, so a
    // child-effect call would arrive before that ref is set.
    React.useEffect(() => {
      const timer = setTimeout(
        () => props.onReady?.({ gridApi: { flushAsyncTransactions: () => {} } }),
        0,
      );
      return () => clearTimeout(timer);
    }, []);
    return <div data-testid="markets-grid-stub" />;
  },
  createMarketsGridContainerEventBus: () => ({ emit: vi.fn(), on: vi.fn(() => () => {}) }),
  MARKETS_GRID_EVENT_CATALOG: [],
  useMarketsGridEventBridge: vi.fn(),
  createPerspectiveWorkerQueries: vi.fn(() => ({ watchCount: vi.fn() })),
}));

const { hoisted } = vi.hoisted(() => ({
  hoisted: {
    cfg: null as Record<string, unknown> | null,
    start: vi.fn(async () => {}),
    attachPerspective: vi.fn(async () => ({
      ok: true as const,
      port: {} as MessagePort,
      tableName: 'positions',
    })),
    table: { fake: 'table' },
    /** Set by the container's data-wiring effect — must never fire here. */
    onSnapshotData: vi.fn(() => () => {}),
    /**
     * ONE object, reused. `useDataServices` returns a context value in the
     * real app, and both the attach refcount and the query-client effect key
     * on that identity — a fresh literal per render would defeat the first
     * and re-run the second forever.
     */
    hubClient: null as Record<string, unknown> | null,
  },
}));

hoisted.hubClient = {
  isProviderRunning: vi.fn().mockResolvedValue(true),
  waitForProviderRunning: vi.fn().mockResolvedValue(true),
  attachPerspective: (id: string) => hoisted.attachPerspective(id),
  subscribePerspectiveQuery: vi.fn(() => ({ subId: 's1', unsubscribe: vi.fn() })),
};

// The engine's own attach hook, stubbed at the seam the container consumes.
// The real one needs a Perspective wasm client; what matters to the container
// is the shape it answers with.
vi.mock('@wellsfargo-starui/grid/perspective', () => ({
  usePerspectiveTable: (client: unknown, providerId: string | null, opts: { enabled?: boolean }) => {
    const [state, setState] = React.useState<Record<string, unknown>>({
      table: null,
      tableName: null,
      status: 'idle',
    });
    React.useEffect(() => {
      if (!client || !providerId || !opts.enabled) return;
      let live = true;
      void (hoisted.attachPerspective as (id: string) => Promise<any>)(providerId).then((outcome) => {
        if (!live) return;
        setState(
          outcome.ok
            ? { table: hoisted.table, tableName: outcome.tableName, status: 'ready' }
            : { table: null, tableName: null, status: 'unavailable', reason: outcome.reason },
        );
      });
      return () => {
        live = false;
      };
    }, [client, providerId, opts.enabled]);
    return state;
  },
  createPerspectiveQueryClient: vi.fn(() => ({ subscribe: vi.fn(), close: vi.fn(), openSubscriptions: 0 })),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({ client: hoisted.hubClient }),
  useDataProvider: () => ({
    provider: {
      id: PROVIDER_ID,
      start: hoisted.start,
      onRowsReceived: vi.fn(() => () => {}),
      onSnapshotData: hoisted.onSnapshotData,
      onTick: vi.fn(() => () => {}),
      onStatus: vi.fn(() => () => {}),
      onError: vi.fn(() => () => {}),
      refresh: vi.fn(),
    },
    refresh: vi.fn(),
    restart: vi.fn(),
  }),
  useDataProviderConfig: () => ({
    cfg: { providerId: PROVIDER_ID, name: 'Positions', config: hoisted.cfg },
    loading: false,
  }),
  useResolvedCfg: () => hoisted.cfg,
  useDataProvidersList: () => ({ configs: [] }),
  useAppDataStore: () => ({
    store: { get: vi.fn(), set: vi.fn(), list: () => [], subscribe: vi.fn(() => () => {}) },
  }),
}));

vi.mock('./LoadingOverlay.js', () => ({
  MarketsGridLoadingOverlay: () => <div data-testid="loading-overlay" />,
}));
vi.mock('./ProviderEditorDialog.js', () => ({ ProviderEditorDialog: () => null }));
vi.mock('./ConfigBrowserDialog.js', () => ({ ConfigBrowserDialog: () => null }));

import { MarketsGridContainer } from './MarketsGridContainer.js';

function makeStorage() {
  const adapter = {
    loadGridLevelData: vi.fn(async () => null),
    saveGridLevelData: vi.fn(async () => {}),
  } as unknown as StorageAdapter;
  return vi.fn(() => adapter);
}

function renderContainer() {
  render(
    <MarketsGridContainer
      gridId="g1"
      instanceId="inst-1"
      appId="app-1"
      userId="u1"
      storage={makeStorage() as never}
      defaultLiveProviderId={PROVIDER_ID}
    />,
  );
}

const gridProps = () => lastMarketsGridProps.current as Record<string, unknown> | null;

beforeEach(() => {
  lastMarketsGridProps.current = null;
  hoisted.start.mockClear();
  hoisted.onSnapshotData.mockClear();
  hoisted.attachPerspective.mockClear();
  hoisted.attachPerspective.mockResolvedValue({
    ok: true,
    port: {} as MessagePort,
    tableName: 'positions',
  });
});

afterEach(cleanup);

describe('MarketsGridContainer — Perspective provider', () => {
  beforeEach(() => {
    hoisted.cfg = {
      providerType: 'stomp-perspective',
      keyColumn: 'positionId',
      columnDefinitions: [{ field: 'positionId', headerName: 'Position' }],
    };
  });

  it('passes rowModel and the worker-held Table down to MarketsGrid', async () => {
    renderContainer();

    await waitFor(() => expect(gridProps()?.perspectiveTable).toBe(hoisted.table));
    expect(gridProps()?.rowModel).toBe('perspective');
    expect(gridProps()?.perspectiveKeyColumn).toBe('positionId');
    expect(gridProps()?.perspectiveQueries).toBeTruthy();
  });

  // A pending attach must reach the grid as `rowModel: 'perspective'` with a
  // null table, so `GridSurfaceSlot` renders its pending state. The container
  // must not choose a surface itself — a stand-in client grid mounting here
  // destroys the platform for the real one.
  it('mounts MarketsGrid with a null table while the attach is in flight', async () => {
    hoisted.attachPerspective.mockReturnValue(new Promise(() => {}) as never);

    renderContainer();

    await waitFor(() => expect(gridProps()).not.toBeNull());
    expect(gridProps()?.rowModel).toBe('perspective');
    expect(gridProps()?.perspectiveTable).toBeNull();
  });

  it('starts the provider so the worker has a Table to hand out', async () => {
    renderContainer();

    await waitFor(() => expect(hoisted.start).toHaveBeenCalled());
  });

  it('never wires the client-side tick path', async () => {
    renderContainer();

    await waitFor(() => expect(gridProps()?.perspectiveTable).toBe(hoisted.table));
    expect(hoisted.onSnapshotData).not.toHaveBeenCalled();
  });

  it('renders the refusal reason instead of an indefinite spinner', async () => {
    hoisted.attachPerspective.mockResolvedValue({
      ok: false,
      reason:
        "Provider 'dp-perspective' has a composite keyColumn [book, id], which cannot "
        + 'index a Perspective Table.',
    } as never);

    renderContainer();

    const alert = await screen.findByTestId('perspective-refusal');
    expect(alert).toHaveTextContent('composite keyColumn [book, id]');
    expect(screen.queryByTestId('loading-overlay')).toBeNull();
  });
});

describe('MarketsGridContainer — classic provider', () => {
  beforeEach(() => {
    hoisted.cfg = {
      providerType: 'stomp',
      keyColumn: 'positionId',
      columnDefinitions: [{ field: 'positionId', headerName: 'Position' }],
    };
  });

  it('passes no row-engine props at all', async () => {
    renderContainer();

    await waitFor(() => expect(gridProps()).not.toBeNull());
    expect(gridProps()?.rowModel).toBeUndefined();
    expect(gridProps()?.perspectiveTable).toBeNull();
    expect(gridProps()?.perspectiveKeyColumn).toBeUndefined();
    expect(gridProps()?.perspectiveQueries).toBeNull();
  });

  it('keeps the client-side tick path wired', async () => {
    renderContainer();

    await waitFor(() => expect(hoisted.onSnapshotData).toHaveBeenCalled());
    expect(hoisted.attachPerspective).not.toHaveBeenCalled();
  });
});
