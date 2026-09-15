import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppDataLookup, defaultOnError, type AppDataStoreLike } from './appDataLookup.js';

function store(rows: Array<{ name: string; values: Record<string, unknown> }> = []): AppDataStoreLike & {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn((name: string, key: string) => rows.find((r) => r.name === name)?.values[key]),
    list: () => rows,
    subscribe: vi.fn(() => () => undefined),
    set: vi.fn(async () => undefined),
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('createAppDataLookup', () => {
  const rows = [
    { name: 'positions', values: { asOfDate: '2020-01-02', desk: 'rates' } },
    { name: 'limits', values: {} },
  ];

  it('reads a value straight off the store', () => {
    const s = store(rows);
    expect(createAppDataLookup(s).get('positions', 'asOfDate')).toBe('2020-01-02');
    expect(s.get).toHaveBeenCalledWith('positions', 'asOfDate');
  });

  it('lists provider names, not rows', () => {
    expect(createAppDataLookup(store(rows)).listProviders()).toEqual(['positions', 'limits']);
    expect(createAppDataLookup(store()).listProviders()).toEqual([]);
  });

  it('lists the keys of one provider', () => {
    expect(createAppDataLookup(store(rows)).keysOf('positions')).toEqual(['asOfDate', 'desk']);
    expect(createAppDataLookup(store(rows)).keysOf('limits')).toEqual([]);
  });

  /**
   * A `{{name.key}}` binding is typed by hand into a cell editor and outlives
   * the provider it names — deleting the provider must leave the binding
   * offering nothing, not throw inside the editor's render.
   */
  it('answers with no keys for a provider that is gone', () => {
    expect(createAppDataLookup(store(rows)).keysOf('deleted')).toEqual([]);
  });

  it('passes a subscription through and hands back its unsubscribe', () => {
    const unsubscribe = vi.fn();
    const s = store();
    s.subscribe.mockReturnValue(unsubscribe);
    const fn = vi.fn();

    expect(createAppDataLookup(s).subscribe(fn)).toBe(unsubscribe);
    expect(s.subscribe).toHaveBeenCalledWith(fn);
  });

  it('writes without making the caller wait on the store', () => {
    // `set` is async on the store; a cell editor that awaited it would block
    // the commit on a config round-trip.
    const s = store();
    expect(createAppDataLookup(s).set('positions', 'desk', 'credit')).toBeUndefined();
    expect(s.set).toHaveBeenCalledWith('positions', 'desk', 'credit');
  });

  it('does not reject when the underlying write fails', async () => {
    const s = store();
    s.set.mockRejectedValue(new Error('offline'));
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);

    createAppDataLookup(s).set('positions', 'desk', 'credit');
    await new Promise((r) => setTimeout(r, 0));

    process.off('unhandledRejection', onUnhandled);
    expect(onUnhandled).not.toHaveBeenCalled();
  });
});

describe('defaultOnError', () => {
  it('logs under the host tag so the source of a provider error is visible', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('provider refused');
    defaultOnError(err);
    expect(error).toHaveBeenCalledWith('[BlotterHost]', err);
  });
});
