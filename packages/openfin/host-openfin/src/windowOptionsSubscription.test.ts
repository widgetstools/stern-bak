import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  subscribeWindowOptions, __resetWindowOptionsSubscriptionForTests,
} from './windowOptionsSubscription.js';

/**
 * This exists so N hooks reading the same window options share ONE
 * `options-changed` listener — without it the runtime fans out N copies of
 * every event for the same window. The tests therefore focus on listener
 * arity (exactly one attach, detach only when the last subscriber leaves) and
 * on the event-shape normalisation, which has to cope with three different
 * payload shapes the runtime has emitted.
 */

let win: {
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  getOptions: ReturnType<typeof vi.fn>;
};
let handler: ((evt: unknown) => void) | undefined;

/** Install a fake `fin` global that looks like an OpenFin window. */
function installFin(getOptions = vi.fn(async () => ({ workspacePlatform: { tabs: 1 } }))) {
  handler = undefined;
  win = {
    on: vi.fn((_evt: string, h: (e: unknown) => void) => { handler = h; }),
    removeListener: vi.fn(),
    getOptions,
  };
  vi.stubGlobal('fin', { me: { getCurrentWindow: vi.fn(async () => win) } });
}

/** Let ensureListener's async chain settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  __resetWindowOptionsSubscriptionForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('outside OpenFin', () => {
  it('returns a noop unsubscribe and never touches a window', () => {
    vi.stubGlobal('fin', undefined);
    const cb = vi.fn();
    const off = subscribeWindowOptions(cb);
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
  });

  it('treats a fin without getCurrentWindow as non-OpenFin', () => {
    vi.stubGlobal('fin', { me: {} });
    expect(() => subscribeWindowOptions(vi.fn())()).not.toThrow();
  });
});

describe('inside OpenFin', () => {
  it('attaches exactly one options-changed listener for many subscribers', async () => {
    installFin();
    subscribeWindowOptions(vi.fn());
    await settle();
    subscribeWindowOptions(vi.fn());
    subscribeWindowOptions(vi.fn());
    await settle();

    expect(win.on).toHaveBeenCalledTimes(1);
  });

  it('delivers the initial options to the first subscriber', async () => {
    installFin();
    const cb = vi.fn();
    subscribeWindowOptions(cb);
    await settle();

    expect(cb).toHaveBeenCalledWith({ workspacePlatform: { tabs: 1 } });
  });

  it('replays the cached options to a late subscriber', async () => {
    installFin();
    subscribeWindowOptions(vi.fn());
    await settle();

    const late = vi.fn();
    subscribeWindowOptions(late);
    // Cached fire is synchronous — no re-read of getOptions.
    expect(late).toHaveBeenCalledWith({ workspacePlatform: { tabs: 1 } });
    expect(win.getOptions).toHaveBeenCalledTimes(1);
  });

  it('fans one event out to every subscriber', async () => {
    installFin();
    const a = vi.fn(); const b = vi.fn();
    subscribeWindowOptions(a);
    await settle();
    subscribeWindowOptions(b);
    a.mockClear(); b.mockClear();

    handler?.({ options: { workspacePlatform: { tabs: 2 } } });
    expect(a).toHaveBeenCalledWith({ workspacePlatform: { tabs: 2 } });
    expect(b).toHaveBeenCalledWith({ workspacePlatform: { tabs: 2 } });
  });

  it('keeps notifying others when one callback throws', async () => {
    installFin();
    const good = vi.fn();
    subscribeWindowOptions(() => { throw new Error('bad subscriber'); });
    await settle();
    subscribeWindowOptions(good);
    good.mockClear();

    expect(() => handler?.({ workspacePlatform: { tabs: 3 } })).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  describe('event shape normalisation', () => {
    it.each([
      ['evt.options', { options: { workspacePlatform: { k: 1 } } }],
      ['evt.newOptions', { newOptions: { workspacePlatform: { k: 1 } } }],
    ])('extracts options from %s', async (_label, evt) => {
      installFin();
      const cb = vi.fn();
      subscribeWindowOptions(cb);
      await settle();
      cb.mockClear();

      handler?.(evt);
      expect(cb).toHaveBeenCalledWith({ workspacePlatform: { k: 1 } });
    });

    it('accepts an event that IS the options object', async () => {
      installFin();
      const cb = vi.fn();
      subscribeWindowOptions(cb);
      await settle();
      cb.mockClear();

      const evt = { workspacePlatform: { k: 2 } };
      handler?.(evt);
      expect(cb).toHaveBeenCalledWith(evt);
    });

    it('re-reads options when the event carries no recognisable shape', async () => {
      installFin();
      const cb = vi.fn();
      subscribeWindowOptions(cb);
      await settle();
      cb.mockClear();
      win.getOptions.mockClear();
      win.getOptions.mockResolvedValue({ workspacePlatform: { reread: true } });

      handler?.({ nothing: 'useful' });
      await settle();
      expect(win.getOptions).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith({ workspacePlatform: { reread: true } });
    });

    it('survives a failing re-read', async () => {
      installFin();
      subscribeWindowOptions(vi.fn());
      await settle();
      win.getOptions.mockRejectedValue(new Error('runtime gone'));

      handler?.({ nothing: 'useful' });
      await settle();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('teardown', () => {
    it('detaches only when the last subscriber unsubscribes', async () => {
      installFin();
      const offA = subscribeWindowOptions(vi.fn());
      await settle();
      const offB = subscribeWindowOptions(vi.fn());

      offA();
      expect(win.removeListener).not.toHaveBeenCalled();
      offB();
      expect(win.removeListener).toHaveBeenCalledTimes(1);
    });

    it('is safe to unsubscribe twice', async () => {
      installFin();
      const off = subscribeWindowOptions(vi.fn());
      await settle();
      off();
      expect(() => off()).not.toThrow();
      expect(win.removeListener).toHaveBeenCalledTimes(1);
    });

    it('re-attaches after every subscriber has left', async () => {
      installFin();
      const off = subscribeWindowOptions(vi.fn());
      await settle();
      off();

      subscribeWindowOptions(vi.fn());
      await settle();
      expect(win.on).toHaveBeenCalledTimes(2);
    });

    it('survives a throwing removeListener', async () => {
      installFin();
      const off = subscribeWindowOptions(vi.fn());
      await settle();
      win.removeListener.mockImplementation(() => { throw new Error('detach failed'); });
      expect(() => off()).not.toThrow();
    });
  });

  it('survives a failing initial getOptions', async () => {
    installFin(vi.fn(async () => { throw new Error('no options'); }));
    const cb = vi.fn();
    subscribeWindowOptions(cb);
    await settle();

    expect(console.warn).toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
  });

  it('survives a throwing win.on', async () => {
    installFin();
    win.on.mockImplementation(() => { throw new Error('cannot attach'); });
    subscribeWindowOptions(vi.fn());
    await settle();
    expect(console.warn).toHaveBeenCalled();
  });
});
