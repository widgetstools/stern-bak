import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishIabTopic, subscribeIabTopic, connectIabChannel } from './iab.js';

/**
 * The IAB seam is the only sanctioned `fin.InterApplicationBus` access for
 * packages outside `packages/openfin`. The contract worth pinning: noop
 * outside OpenFin, wildcard-uuid source filter (a tool window must hear the
 * platform provider, whose uuid differs), and error propagation on publish
 * (callers own their diagnostics).
 */

let originalFin: unknown;

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalFin = (globalThis as any).fin;
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fin = originalFin;
  vi.restoreAllMocks();
});

function installIab(over: Record<string, unknown> = {}) {
  const iab = {
    publish: vi.fn(async () => {}),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    Channel: { connect: vi.fn(async () => ({ register: vi.fn(), disconnect: vi.fn() })) },
    ...over,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fin = { InterApplicationBus: iab };
  return iab;
}

describe('publishIabTopic', () => {
  it('resolves as a noop outside OpenFin', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = undefined;
    await expect(publishIabTopic('t', { a: 1 })).resolves.toBeUndefined();
  });

  it('publishes through fin.InterApplicationBus', async () => {
    const iab = installIab();
    await publishIabTopic('theme-changed', { theme: 'dark' });
    expect(iab.publish).toHaveBeenCalledWith('theme-changed', { theme: 'dark' });
  });

  it('propagates publish rejections to the caller', async () => {
    installIab({ publish: vi.fn(async () => { throw new Error('bus down'); }) });
    await expect(publishIabTopic('t', {})).rejects.toThrow('bus down');
  });
});

describe('subscribeIabTopic', () => {
  it('is a noop disposer outside OpenFin', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = undefined;
    const off = subscribeIabTopic('t', () => {});
    expect(() => off()).not.toThrow();
  });

  it('subscribes with the wildcard uuid and unsubscribes the same handler', () => {
    const iab = installIab();
    const handler = () => {};
    const off = subscribeIabTopic('registry-config-update', handler);
    expect(iab.subscribe).toHaveBeenCalledWith({ uuid: '*' }, 'registry-config-update', handler);
    off();
    expect(iab.unsubscribe).toHaveBeenCalledWith({ uuid: '*' }, 'registry-config-update', handler);
  });

  it('survives a throwing subscribe with a warn and a safe disposer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installIab({ subscribe: vi.fn(() => { throw new Error('not ready'); }) });
    const off = subscribeIabTopic('t', () => {});
    expect(warn).toHaveBeenCalled();
    expect(() => off()).not.toThrow();
  });
});

describe('connectIabChannel', () => {
  it('resolves null outside OpenFin', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = undefined;
    await expect(connectIabChannel('c')).resolves.toBe(null);
  });

  it('resolves null when the runtime lacks the Channel API', async () => {
    installIab({ Channel: undefined });
    await expect(connectIabChannel('c')).resolves.toBe(null);
  });

  it('hands back the connected client', async () => {
    const iab = installIab();
    const client = await connectIabChannel('marketsui-workspace-save-channel');
    expect(iab.Channel.connect).toHaveBeenCalledWith('marketsui-workspace-save-channel');
    expect(client).not.toBeNull();
    expect(typeof client!.register).toBe('function');
  });
});
