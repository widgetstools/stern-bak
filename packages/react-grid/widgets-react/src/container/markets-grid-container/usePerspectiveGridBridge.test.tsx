import React, { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * The hook reaches `@wellsfargo-starui/grid` for one factory, but importing
 * the package root pulls in MarketsGrid and the whole AG Grid enterprise
 * graph. In the container that costs nothing — it renders MarketsGrid anyway —
 * but here it loads a second full grid into a fork that already holds one, and
 * the fork runs out of heap. Stubbed down to the seam under test: the mock
 * still routes through the real query client, so the StrictMode case below
 * asserts something.
 */
vi.mock('@wellsfargo-starui/grid', () => ({
  createPerspectiveWorkerQueries: ({
    client,
    providerId,
  }: {
    client: { subscribe(id: string, query: unknown, onResult: unknown): () => void };
    providerId: string;
  }) => ({
    watchCount: (filterModel: unknown, onCount: unknown) =>
      client.subscribe(providerId, { kind: 'count', filterModel }, onCount),
  }),
}));

import {
  isPerspectiveProviderType,
  usePerspectiveGridBridge,
  type PerspectiveGridBridge,
  type PerspectiveHubClientLike,
} from './usePerspectiveGridBridge.js';

function makeClient(
  attach: PerspectiveHubClientLike['attachPerspective'] = vi.fn(async () => ({
    ok: true as const,
    port: {} as MessagePort,
    tableName: 'positions',
  })),
) {
  const unsubscribe = vi.fn();
  return {
    attachPerspective: attach,
    subscribePerspectiveQuery: vi.fn(() => ({ subId: 's1', unsubscribe })),
  } satisfies PerspectiveHubClientLike;
}

/** Render the hook and expose its latest result. */
function renderBridge(
  params: Parameters<typeof usePerspectiveGridBridge>[0],
  opts: { strict?: boolean } = {},
) {
  const seen: { current: PerspectiveGridBridge | null } = { current: null };
  function Probe() {
    seen.current = usePerspectiveGridBridge(params);
    return <div data-testid="probe">{seen.current.status}</div>;
  }
  const ui = opts.strict ? (
    <StrictMode>
      <Probe />
    </StrictMode>
  ) : (
    <Probe />
  );
  const result = render(ui);
  return { seen, ...result };
}

const perspectiveCfg = {
  providerType: 'stomp-perspective',
  keyColumn: 'positionId',
} as never;

/**
 * Stand in for the Perspective client module. `usePerspectiveTable` would
 * otherwise dynamic-import the real one, whose wasm has no business in a
 * container unit test — and whose failure to load would read here as an
 * attach error.
 */
const fakeLoad = async () => ({
  worker: async () => ({ open_table: async () => ({ fake: 'table' }) as never }),
});

describe('isPerspectiveProviderType', () => {
  it('is true for exactly the two Table-hosted types', () => {
    expect(isPerspectiveProviderType('stomp-perspective')).toBe(true);
    expect(isPerspectiveProviderType('mock-perspective')).toBe(true);
    expect(isPerspectiveProviderType('stomp')).toBe(false);
    expect(isPerspectiveProviderType(undefined)).toBe(false);
  });
});

describe('usePerspectiveGridBridge', () => {
  it('is inert for a classic provider — no rowModel, no start, no attach', async () => {
    const client = makeClient();
    const start = vi.fn(async () => {});

    const { seen } = renderBridge({
      cfg: { providerType: 'stomp', keyColumn: 'positionId' } as never,
      providerId: 'dp-1',
      provider: { start },
      client,
      loadPerspective: fakeLoad,
    });

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('idle'));
    expect(seen.current?.rowModel).toBeUndefined();
    expect(seen.current?.queries).toBeNull();
    expect(start).not.toHaveBeenCalled();
    expect(client.attachPerspective).not.toHaveBeenCalled();
  });

  // The worker refuses an attach for a provider that is not running, and the
  // refusal reads as permanent. Ordering is the whole point of this hook.
  it('starts the provider before attaching', async () => {
    const order: string[] = [];
    const client = makeClient(
      vi.fn(async () => {
        order.push('attach');
        return { ok: true as const, port: {} as MessagePort, tableName: 'positions' };
      }),
    );

    renderBridge({
      cfg: perspectiveCfg,
      providerId: 'dp-1',
      provider: {
        start: vi.fn(async () => {
          order.push('start');
        }),
      },
      client,
      loadPerspective: fakeLoad,
    });

    await waitFor(() => expect(order).toEqual(['start', 'attach']));
  });

  it('reports the Table, the key column and a query bridge once attached', async () => {
    const { seen } = renderBridge({
      cfg: perspectiveCfg,
      providerId: 'dp-1',
      provider: { start: vi.fn(async () => {}) },
      client: makeClient(),
      loadPerspective: fakeLoad,
    });

    await waitFor(() => expect(seen.current?.status).toBe('ready'));
    expect(seen.current?.rowModel).toBe('perspective');
    expect(seen.current?.keyColumn).toBe('positionId');
    expect(seen.current?.queries).toBeTruthy();
  });

  it('reads as attaching — never idle — while the provider is still starting', async () => {
    let releaseStart: () => void = () => {};
    const { seen } = renderBridge({
      cfg: perspectiveCfg,
      providerId: 'dp-1',
      provider: {
        start: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              releaseStart = resolve;
            }),
        ),
      },
      client: makeClient(),
      loadPerspective: fakeLoad,
    });

    await waitFor(() => expect(seen.current?.status).toBe('attaching'));
    expect(seen.current?.rowModel).toBe('perspective');
    expect(seen.current?.table).toBeNull();
    releaseStart();
  });

  // A composite keyColumn has no Table equivalent. There is nothing to guess
  // at, so nothing is passed down and the worker's refusal is what shows.
  it('passes no key column for a composite one, and surfaces the refusal', async () => {
    const { seen } = renderBridge({
      cfg: { providerType: 'stomp-perspective', keyColumn: ['book', 'id'] } as never,
      providerId: 'dp-1',
      provider: { start: vi.fn(async () => {}) },
      client: makeClient(
        vi.fn(async () => ({
          ok: false as const,
          reason: "Provider 'dp-1' has a composite keyColumn [book, id], which cannot index a Perspective Table.",
        })),
      ),
      loadPerspective: fakeLoad,
    });

    await waitFor(() => expect(seen.current?.status).toBe('unavailable'));
    expect(seen.current?.keyColumn).toBeUndefined();
    expect(seen.current?.reason).toContain('composite keyColumn [book, id]');
  });

  it('reports a failed provider start as a reason rather than a permanent spinner', async () => {
    const { seen } = renderBridge({
      cfg: perspectiveCfg,
      providerId: 'dp-1',
      provider: { start: vi.fn(async () => { throw new Error('no catalog row'); }) },
      client: makeClient(),
      loadPerspective: fakeLoad,
    });

    await waitFor(() => expect(seen.current?.status).toBe('error'));
    expect(seen.current?.reason).toBe('no catalog row');
    expect(seen.current?.rowModel).toBe('perspective');
  });

  /**
   * `close()` on a query client is permanent — a closed one answers every later
   * `subscribe` with a no-op. StrictMode runs cleanup then setup on the same
   * mount, so a client held in a memo would be closed by the first cleanup and
   * reused by the second setup, leaving every whole-book question unanswered
   * with nothing to show for it.
   */
  it('survives StrictMode with a query client that still works', async () => {
    const client = makeClient();

    const { seen } = renderBridge(
      {
        cfg: perspectiveCfg,
        providerId: 'dp-1',
        provider: { start: vi.fn(async () => {}) },
        client,
        loadPerspective: fakeLoad,
      },
      { strict: true },
    );

    await waitFor(() => expect(seen.current?.queries).toBeTruthy());
    seen.current!.queries!.watchCount({}, () => {});
    expect(client.subscribePerspectiveQuery).toHaveBeenCalled();
  });
});
