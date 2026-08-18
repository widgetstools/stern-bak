/**
 * The notifier bridges three paths onto one callback shape: a local emit, an
 * outbound broadcast, and an inbound broadcast that must NOT re-broadcast.
 * The cases below drive each path, plus the two failure modes that matter —
 * a listener that throws, and an environment with no BroadcastChannel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeNotifier } from './changeNotifier.js';

/**
 * A BroadcastChannel stand-in that keeps every instance on one bus, so a
 * message posted by one notifier reaches the others — jsdom's own channel is
 * per-realm and would not.
 */
class FakeChannel {
  static instances: FakeChannel[] = [];
  static failPost = false;
  static failClose = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  closed = false;
  readonly posted: unknown[] = [];

  constructor(readonly name: string) {
    FakeChannel.instances.push(this);
  }

  postMessage(data: unknown) {
    if (FakeChannel.failPost) throw new Error('channel is dead');
    this.posted.push(data);
    for (const other of FakeChannel.instances) {
      if (other !== this && !other.closed && other.name === this.name) {
        other.onmessage?.({ data });
      }
    }
  }

  close() {
    if (FakeChannel.failClose) throw new Error('already closed');
    this.closed = true;
  }
}

const realChannel = globalThis.BroadcastChannel;

beforeEach(() => {
  FakeChannel.instances = [];
  FakeChannel.failPost = false;
  FakeChannel.failClose = false;
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = FakeChannel;
});

afterEach(() => {
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = realChannel;
  vi.restoreAllMocks();
});

describe('same-tab notification', () => {
  it('fires the per-config listener', () => {
    const n = new ChangeNotifier();
    const seen: string[] = [];
    n.subscribe('cfg-1', () => seen.push('cfg-1'));

    n.notify('cfg-1');
    expect(seen).toEqual(['cfg-1']);
  });

  it('does not fire a listener for a different config', () => {
    const n = new ChangeNotifier();
    const seen: string[] = [];
    n.subscribe('cfg-1', () => seen.push('cfg-1'));

    n.notify('cfg-2');
    expect(seen).toEqual([]);
  });

  it('fires every global listener with the id that changed', () => {
    const n = new ChangeNotifier();
    const seen: string[] = [];
    n.subscribeAll((id) => seen.push(`a:${id}`));
    n.subscribeAll((id) => seen.push(`b:${id}`));

    n.notify('cfg-1');
    expect(seen).toEqual(['a:cfg-1', 'b:cfg-1']);
  });

  it('fires both global and per-config listeners for one write', () => {
    const n = new ChangeNotifier();
    const seen: string[] = [];
    n.subscribeAll(() => seen.push('all'));
    n.subscribe('cfg-1', () => seen.push('one'));

    n.notify('cfg-1');
    expect(seen).toEqual(['all', 'one']);
  });

  it('fans one config out to several listeners', () => {
    const n = new ChangeNotifier();
    const seen: string[] = [];
    n.subscribe('cfg-1', () => seen.push('a'));
    n.subscribe('cfg-1', () => seen.push('b'));

    n.notify('cfg-1');
    expect(seen).toEqual(['a', 'b']);
  });
});

describe('unsubscribe', () => {
  it('stops a per-config listener', () => {
    const n = new ChangeNotifier();
    const seen: string[] = [];
    const off = n.subscribe('cfg-1', () => seen.push('a'));
    off();

    n.notify('cfg-1');
    expect(seen).toEqual([]);
  });

  it('stops a global listener', () => {
    const n = new ChangeNotifier();
    const seen: string[] = [];
    const off = n.subscribeAll(() => seen.push('a'));
    off();

    n.notify('cfg-1');
    expect(seen).toEqual([]);
  });

  it('is safe to unsubscribe twice', () => {
    const n = new ChangeNotifier();
    const off = n.subscribe('cfg-1', () => undefined);
    off();
    expect(() => off()).not.toThrow();
  });

  it('leaves siblings subscribed', () => {
    const n = new ChangeNotifier();
    const seen: string[] = [];
    const offA = n.subscribe('cfg-1', () => seen.push('a'));
    n.subscribe('cfg-1', () => seen.push('b'));
    offA();

    n.notify('cfg-1');
    expect(seen).toEqual(['b']);
  });

  it('keeps firing the rest when one listener unsubscribes mid-fire', () => {
    const n = new ChangeNotifier();
    const seen: string[] = [];
    const offA = n.subscribe('cfg-1', () => {
      seen.push('a');
      offA();
    });
    n.subscribe('cfg-1', () => seen.push('b'));

    n.notify('cfg-1');
    // The snapshot before iterating is what keeps 'b' reachable.
    expect(seen).toEqual(['a', 'b']);
  });
});

describe('a listener that throws', () => {
  it('does not stop its siblings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const n = new ChangeNotifier();
    const seen: string[] = [];
    n.subscribe('cfg-1', () => {
      throw new Error('subscriber blew up');
    });
    n.subscribe('cfg-1', () => seen.push('b'));

    n.notify('cfg-1');
    expect(seen).toEqual(['b']);
    expect(warn).toHaveBeenCalled();
  });

  it('does not stop the write that triggered it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const n = new ChangeNotifier();
    n.subscribeAll(() => {
      throw new Error('global subscriber blew up');
    });

    expect(() => n.notify('cfg-1')).not.toThrow();
  });
});

describe('cross-tab', () => {
  it('broadcasts a local write', () => {
    const n = new ChangeNotifier('bus');
    n.notify('cfg-1');

    expect(FakeChannel.instances[0].posted).toEqual([
      { type: 'configChanged', configId: 'cfg-1' },
    ]);
  });

  it("delivers another tab's write to local listeners", () => {
    const a = new ChangeNotifier('bus');
    const b = new ChangeNotifier('bus');
    const seen: string[] = [];
    b.subscribe('cfg-1', () => seen.push('b'));

    a.notify('cfg-1');
    expect(seen).toEqual(['b']);
  });

  it('does not re-broadcast what it received', () => {
    const a = new ChangeNotifier('bus');
    const b = new ChangeNotifier('bus');
    a.notify('cfg-1');

    // One hop only; re-broadcasting would loop the channel forever.
    expect((b as unknown as { channel: FakeChannel }).channel.posted).toEqual([]);
  });

  it('ignores a message that is not a config change', () => {
    const n = new ChangeNotifier('bus');
    const seen: string[] = [];
    n.subscribeAll((id) => seen.push(id));
    const channel = (n as unknown as { channel: FakeChannel }).channel;

    channel.onmessage?.({ data: null });
    channel.onmessage?.({ data: { type: 'somethingElse', configId: 'cfg-1' } });
    channel.onmessage?.({ data: { type: 'configChanged' } });
    channel.onmessage?.({ data: { type: 'configChanged', configId: 42 } });

    expect(seen).toEqual([]);
  });

  it('ignores an inbound message after dispose', () => {
    const n = new ChangeNotifier('bus');
    const seen: string[] = [];
    n.subscribeAll((id) => seen.push(id));
    const channel = (n as unknown as { channel: FakeChannel }).channel;
    n.dispose();

    channel.onmessage?.({ data: { type: 'configChanged', configId: 'cfg-1' } });
    expect(seen).toEqual([]);
  });

  it('still notifies locally when a broadcast throws', () => {
    const n = new ChangeNotifier('bus');
    const seen: string[] = [];
    n.subscribeAll((id) => seen.push(id));
    FakeChannel.failPost = true;

    expect(() => n.notify('cfg-1')).not.toThrow();
    expect(seen).toEqual(['cfg-1']);
  });
});

describe('environments without a channel', () => {
  it('still notifies locally when BroadcastChannel is absent', () => {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = undefined;
    const n = new ChangeNotifier();
    const seen: string[] = [];
    n.subscribeAll((id) => seen.push(id));

    n.notify('cfg-1');
    expect(seen).toEqual(['cfg-1']);
  });

  it('still notifies locally when the constructor throws', () => {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = function Blocked() {
      throw new Error('disabled in private mode');
    };
    const n = new ChangeNotifier();
    const seen: string[] = [];
    n.subscribeAll((id) => seen.push(id));

    n.notify('cfg-1');
    expect(seen).toEqual(['cfg-1']);
  });
});

describe('dispose', () => {
  it('drops every listener', () => {
    const n = new ChangeNotifier();
    const seen: string[] = [];
    n.subscribe('cfg-1', () => seen.push('one'));
    n.subscribeAll(() => seen.push('all'));
    n.dispose();

    n.notify('cfg-1');
    expect(seen).toEqual([]);
  });

  it('closes the channel', () => {
    const n = new ChangeNotifier('bus');
    const channel = (n as unknown as { channel: FakeChannel }).channel;
    n.dispose();

    expect(channel.closed).toBe(true);
  });

  it('survives a channel that refuses to close', () => {
    const n = new ChangeNotifier('bus');
    FakeChannel.failClose = true;

    expect(() => n.dispose()).not.toThrow();
  });

  it('is safe to dispose twice', () => {
    const n = new ChangeNotifier('bus');
    n.dispose();
    expect(() => n.dispose()).not.toThrow();
  });
});
