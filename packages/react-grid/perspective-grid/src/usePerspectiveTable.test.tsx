import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  usePerspectiveTable,
  type PerspectiveAttachOutcome,
  type PerspectiveClientModuleLike,
} from './usePerspectiveTable.js';

const table = { view: vi.fn() };

function makeLoader() {
  const opened: string[] = [];
  const ports: unknown[] = [];
  const load = (): Promise<PerspectiveClientModuleLike> =>
    Promise.resolve({
      worker: async (port: unknown) => {
        ports.push(await port);
        return {
          open_table: async (name: string) => {
            opened.push(name);
            return table as never;
          },
        };
      },
    } as PerspectiveClientModuleLike);
  return { load, opened, ports };
}

function makeClient(outcome: () => PerspectiveAttachOutcome) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      attachPerspective: async (providerId: string) => {
        calls.push(providerId);
        return outcome();
      },
    },
  };
}

const okOutcome = (): PerspectiveAttachOutcome => ({
  ok: true,
  port: new MessageChannel().port1,
  tableName: 'positions',
});

describe('usePerspectiveTable', () => {
  it('attaches, builds this window Client on the port, and opens the named Table', async () => {
    const { load, opened, ports } = makeLoader();
    const { client, calls } = makeClient(okOutcome);

    const { result } = renderHook(() =>
      usePerspectiveTable(client, 'p1', { loadPerspective: load }),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(calls).toEqual(['p1']);
    expect(opened).toEqual(['positions']);
    expect(result.current.table).toBe(table);
    expect(result.current.tableName).toBe('positions');
    // The Client speaks over the port the worker bound its session to.
    expect(ports[0]).toBeInstanceOf(MessagePort);
  });

  // Reporting 'unavailable' instead of hanging is what lets a caller fall back
  // to the push path — a caller left waiting cannot tell the two apart.
  it('reports unavailable with the reason when the provider holds no Table', async () => {
    const { load } = makeLoader();
    const { client } = makeClient(() => ({ ok: false, reason: 'holds no Table' }));

    const { result } = renderHook(() =>
      usePerspectiveTable(client, 'p1', { loadPerspective: load }),
    );

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.reason).toBe('holds no Table');
    expect(result.current.table).toBeNull();
  });

  it('reports an error when the engine fails to load', async () => {
    const { client } = makeClient(okOutcome);
    const { result } = renderHook(() =>
      usePerspectiveTable(client, 'p1', {
        loadPerspective: () => Promise.reject(new Error('wasm blocked')),
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.reason).toBe('wasm blocked');
  });

  it('stays idle without a provider id, a client, or when disabled', async () => {
    const { load } = makeLoader();
    const { client, calls } = makeClient(okOutcome);

    const { result: noId } = renderHook(() =>
      usePerspectiveTable(client, null, { loadPerspective: load }),
    );
    const { result: noClient } = renderHook(() =>
      usePerspectiveTable(null, 'p1', { loadPerspective: load }),
    );
    const { result: off } = renderHook(() =>
      usePerspectiveTable(client, 'p1', { loadPerspective: load, enabled: false }),
    );

    expect(noId.current.status).toBe('idle');
    expect(noClient.current.status).toBe('idle');
    expect(off.current.status).toBe('idle');
    expect(calls).toEqual([]);
  });

  // MEASURED: closing on the spot broke StrictMode's setup → cleanup → setup.
  // The port died a microtask before the second setup asked for it back, and
  // the Table opened over it read 0 rows forever with no error to explain it.
  it('keeps the port open across an immediate unmount/remount, then closes it', async () => {
    const port = new MessageChannel().port1;
    const closed = vi.spyOn(port, 'close');
    const { load } = makeLoader();
    const { client } = makeClient(() => ({ ok: true, port, tableName: 'positions' }));

    const first = renderHook(() => usePerspectiveTable(client, 'p1', { loadPerspective: load }));
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    first.unmount();

    const second = renderHook(() => usePerspectiveTable(client, 'p1', { loadPerspective: load }));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(closed).not.toHaveBeenCalled();

    second.unmount();

    // Closes only once the linger window passes with no consumer left.
    await waitFor(() => expect(closed).toHaveBeenCalled(), { timeout: 4_000 });
    expect('delete' in table).toBe(false);
  }, 10_000);

  it('shares one attach between two consumers of the same provider', async () => {
    const { load, opened } = makeLoader();
    const { client, calls } = makeClient(okOutcome);

    const a = renderHook(() => usePerspectiveTable(client, 'shared', { loadPerspective: load }));
    const b = renderHook(() => usePerspectiveTable(client, 'shared', { loadPerspective: load }));

    await waitFor(() => expect(a.result.current.status).toBe('ready'));
    await waitFor(() => expect(b.result.current.status).toBe('ready'));

    // Two blotters on one provider read the Table over ONE port and one client.
    expect(calls).toEqual(['shared']);
    expect(opened).toEqual(['positions']);
    expect(a.result.current.table).toBe(b.result.current.table);
    a.unmount();
    b.unmount();
  });

  // An inline arrow loader is what a caller writes in render. Re-attaching on
  // every render would tear down a live Table and re-fetch the engine.
  it('does not re-attach when only the loader identity changes', async () => {
    const { client, calls } = makeClient(okOutcome);
    const { result, rerender } = renderHook(
      ({ n }: { n: number }) =>
        usePerspectiveTable(client, 'p1', {
          loadPerspective: () => makeLoader().load().then((m) => ({ ...m, n })),
        }),
      { initialProps: { n: 1 } },
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ n: 2 });
    rerender({ n: 3 });

    expect(calls).toEqual(['p1']);
  });

  it('re-attaches when the provider id changes', async () => {
    const { load } = makeLoader();
    const { client, calls } = makeClient(okOutcome);
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePerspectiveTable(client, id, { loadPerspective: load }),
      { initialProps: { id: 'p1' } },
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ id: 'p2' });
    await waitFor(() => expect(calls).toEqual(['p1', 'p2']));
  });
});
