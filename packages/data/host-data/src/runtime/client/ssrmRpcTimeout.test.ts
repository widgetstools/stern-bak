/**
 * SSRM RPCs must not hang forever.
 *
 * AG Grid marks a block "loading" until the datasource calls back. If a hub
 * reply is lost (worker died, port torn down, postMessage swallowed), an
 * un-timed-out promise never settles, so the datasource never calls
 * `params.fail()` — the rows spin on "Loading…" and AG Grid will not retry
 * because it still believes the request is in flight.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedWorkerDataServicesClient } from './SharedWorkerDataServicesClient';

/** A port that accepts messages and never answers. */
function deadPort(): MessagePort {
  return {
    postMessage() {},
    start() {},
    close() {},
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MessagePort;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SSRM RPC timeout', () => {
  it('rejects a getRows request whose reply never arrives', async () => {
    const client = new SharedWorkerDataServicesClient(deadPort(), {
      disablePageHideClose: true,
      ssrmRpcTimeoutMs: 5_000,
    });

    const pending = client.ssrmGetRows('p1', 's1', {
      startRow: 0,
      endRow: 100,
    } as never);
    const settled = expect(pending).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(5_001);
    await settled;

    client.close();
  });

  it('does not reject when the reply arrives before the deadline', async () => {
    let onMessage: ((ev: MessageEvent) => void) | null = null;
    const port = {
      postMessage() {},
      start() {},
      close() {},
      addEventListener(_t: string, fn: (ev: MessageEvent) => void) {
        onMessage = fn;
      },
      removeEventListener() {},
    } as unknown as MessagePort;

    const sent: unknown[] = [];
    (port as unknown as { postMessage: (m: unknown) => void }).postMessage = (m) => {
      sent.push(m);
    };

    const client = new SharedWorkerDataServicesClient(port, {
      disablePageHideClose: true,
      ssrmRpcTimeoutMs: 5_000,
    });

    const pending = client.ssrmGetRows('p1', 's1', {
      startRow: 0,
      endRow: 100,
    } as never);

    const reqId = (sent[0] as { reqId: string }).reqId;
    onMessage?.({
      data: {
        kind: 'ssrm-rpc',
        reqId,
        ok: true,
        getRows: { rowData: [], rowCount: 0 },
      },
    } as MessageEvent);

    await expect(pending).resolves.toBeDefined();

    // The armed timer must not fire against an already-settled request.
    await vi.advanceTimersByTimeAsync(10_000);
    client.close();
  });
});
