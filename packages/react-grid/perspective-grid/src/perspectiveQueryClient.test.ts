/**
 * The window-side query client — one worker subscription per question this
 * window asks, and NO polling anywhere in it.
 *
 * The interesting behaviour is the split: absolute answers (counts,
 * aggregates, value lists) are shared between local listeners, transitions
 * (`matchSet`, `changeRule`) are not, because handing a "what just changed"
 * push to a listener that subscribed afterwards reports something it was
 * never around for.
 */

import { describe, expect, it, vi } from 'vitest';
import type { PerspectiveQueryResult, PerspectiveQuerySpec } from '@wellsfargo-starui/types';
import {
  createPerspectiveQueryClient,
  type PerspectiveQueryClientLike,
} from './perspectiveQueryClient';

interface FakeSub {
  providerId: string;
  query: PerspectiveQuerySpec;
  push(result: PerspectiveQueryResult): void;
  unsubscribed: boolean;
}

function fakeClient(): PerspectiveQueryClientLike & { subs: FakeSub[]; live: number } {
  const subs: FakeSub[] = [];
  return {
    subs,
    get live() {
      return subs.filter((s) => !s.unsubscribed).length;
    },
    subscribePerspectiveQuery(providerId, query, onResult) {
      const sub: FakeSub = { providerId, query, push: onResult, unsubscribed: false };
      subs.push(sub);
      return {
        subId: `s${subs.length}`,
        unsubscribe: () => {
          sub.unsubscribed = true;
        },
      };
    },
  };
}

const COUNT: PerspectiveQuerySpec = { kind: 'count' };

describe('createPerspectiveQueryClient', () => {
  it('opens ONE worker subscription for two local listeners on the same question', () => {
    const worker = fakeClient();
    const client = createPerspectiveQueryClient(worker);
    const a = vi.fn();
    const b = vi.fn();

    client.subscribe('p1', COUNT, a);
    client.subscribe('p1', COUNT, b);

    expect(worker.live).toBe(1);
    expect(client.openSubscriptions).toBe(1);

    worker.subs[0].push({ kind: 'count', count: 7 });
    expect(a).toHaveBeenCalledWith({ kind: 'count', count: 7 });
    expect(b).toHaveBeenCalledWith({ kind: 'count', count: 7 });
  });

  it('replays the last absolute answer to a listener that joins late', () => {
    const worker = fakeClient();
    const client = createPerspectiveQueryClient(worker);

    client.subscribe('p1', COUNT, () => {});
    worker.subs[0].push({ kind: 'count', count: 7 });

    const late = vi.fn();
    client.subscribe('p1', COUNT, late);

    // Paints immediately rather than waiting for the next tick of a feed
    // that may be quiet.
    expect(late).toHaveBeenCalledWith({ kind: 'count', count: 7 });
  });

  it('separates questions that differ, and providers that differ', () => {
    const worker = fakeClient();
    const client = createPerspectiveQueryClient(worker);

    client.subscribe('p1', COUNT, () => {});
    client.subscribe('p2', COUNT, () => {});
    client.subscribe('p1', { kind: 'aggregate', colId: 'pnl', aggregate: 'sum' }, () => {});

    expect(worker.live).toBe(3);
  });

  it('holds the worker subscription until the LAST local listener leaves', () => {
    const worker = fakeClient();
    const client = createPerspectiveQueryClient(worker);

    const offA = client.subscribe('p1', COUNT, () => {});
    const offB = client.subscribe('p1', COUNT, () => {});

    offA();
    expect(worker.live).toBe(1);
    offB();
    expect(worker.live).toBe(0);
  });

  it('is safe to unsubscribe twice', () => {
    const worker = fakeClient();
    const client = createPerspectiveQueryClient(worker);
    const off = client.subscribe('p1', COUNT, () => {});

    off();
    off();

    expect(worker.live).toBe(0);
    expect(client.openSubscriptions).toBe(0);
  });

  it('re-opens after the last listener left', () => {
    const worker = fakeClient();
    const client = createPerspectiveQueryClient(worker);

    client.subscribe('p1', COUNT, () => {})();
    const back = vi.fn();
    client.subscribe('p1', COUNT, back);

    expect(worker.subs).toHaveLength(2);
    expect(worker.live).toBe(1);
    // A fresh subscription has no history to replay, so nothing fires yet.
    expect(back).not.toHaveBeenCalled();
  });

  it('gives every matchSet listener its OWN worker subscription', () => {
    const worker = fakeClient();
    const client = createPerspectiveQueryClient(worker);
    const query: PerspectiveQuerySpec = { kind: 'matchSet', source: '"pnl" > 5' };

    client.subscribe('p1', query, () => {});
    client.subscribe('p1', query, () => {});

    // A transition push is only meaningful to a subscriber that was there
    // for the previous state. The worker still shares the View between
    // them; what it does not share is what each has already seen.
    expect(worker.live).toBe(2);
  });

  it('gives every changeRule listener its own worker subscription', () => {
    const worker = fakeClient();
    const client = createPerspectiveQueryClient(worker);
    const query: PerspectiveQuerySpec = {
      kind: 'changeRule', ruleId: 'r1', field: 'price', mode: 'relativeChange',
    };

    client.subscribe('p1', query, () => {});
    client.subscribe('p1', query, () => {});

    expect(worker.live).toBe(2);
  });

  it('delivers a refusal on the same callback rather than throwing', () => {
    const worker = fakeClient();
    const client = createPerspectiveQueryClient(worker);
    const seen = vi.fn();

    client.subscribe('p1', COUNT, seen);
    worker.subs[0].push({ kind: 'refused', reason: 'no engine' });

    expect(seen).toHaveBeenCalledWith({ kind: 'refused', reason: 'no engine' });
  });

  it('close() drops every subscription of both shapes', () => {
    const worker = fakeClient();
    const client = createPerspectiveQueryClient(worker);

    client.subscribe('p1', COUNT, () => {});
    client.subscribe('p1', { kind: 'matchSet', source: 'true' }, () => {});
    expect(worker.live).toBe(2);

    client.close();

    expect(worker.live).toBe(0);
    expect(client.openSubscriptions).toBe(0);
    // And nothing new can be opened on a closed client.
    client.subscribe('p1', COUNT, () => {});
    expect(worker.live).toBe(0);
  });
});
