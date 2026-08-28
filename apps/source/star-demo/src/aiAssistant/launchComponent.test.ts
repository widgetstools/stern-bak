/**
 * Reloading the component the user already has open.
 *
 * Most assistant edits land in the row the grid is reading and re-apply live.
 * The provider binding and a provider's columns are read once at mount, so they
 * are the exception — and the answer is to reload the OPEN window, never to
 * tell the user to open the blotter again: reopening a non-singleton spawns a
 * second copy, and for a singleton the launcher focuses without reloading, so
 * the stale feed would survive the trip.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadOpenComponents, describeReload } from './launchComponent';

interface FakeWindow {
  identity: { name: string };
  reload: () => Promise<void>;
}

function stubOpenFin(windows: FakeWindow[] | Error) {
  const getChildWindows = vi.fn(async () => {
    if (windows instanceof Error) throw windows;
    return windows;
  });
  vi.stubGlobal('fin', { Application: { getCurrentSync: () => ({ getChildWindows }) } });
  return { getChildWindows };
}

const win = (name: string, reload = vi.fn().mockResolvedValue(undefined)): FakeWindow => ({
  identity: { name },
  reload,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reloadOpenComponents', () => {
  it('reloads only the windows of the component it was asked about', async () => {
    const mine = vi.fn().mockResolvedValue(undefined);
    const other = vi.fn().mockResolvedValue(undefined);
    stubOpenFin([
      win('registered-grid-credit-grid-credit', mine),
      win('registered-grid-rates-grid-rates', other),
    ]);

    await expect(reloadOpenComponents('grid-credit')).resolves.toBe(1);

    expect(mine).toHaveBeenCalled();
    expect(other).not.toHaveBeenCalled();
  });

  /** An older multi-instance blotter has one window per cloned row. */
  it('reloads every window of a multi-instance blotter', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    stubOpenFin([
      win('registered-grid-credit-dev1grid-credit-1', first),
      win('registered-grid-credit-dev1grid-credit-2', second),
    ]);

    await expect(reloadOpenComponents('grid-credit')).resolves.toBe(2);
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  /** A window closing mid-call is ordinary, and must not cost the others. */
  it('counts what actually reloaded when one window fails', async () => {
    stubOpenFin([
      win('registered-grid-credit-a', vi.fn().mockRejectedValue(new Error('window closed'))),
      win('registered-grid-credit-b'),
    ]);

    await expect(reloadOpenComponents('grid-credit')).resolves.toBe(1);
  });

  it('reports nothing reloaded when the blotter has no open window', async () => {
    stubOpenFin([win('registered-grid-rates-grid-rates')]);
    await expect(reloadOpenComponents('grid-credit')).resolves.toBe(0);
  });

  /** Plain-browser dev and the unit suite have no `fin` at all. */
  it('is a no-op outside OpenFin', async () => {
    await expect(reloadOpenComponents('grid-credit')).resolves.toBe(0);
  });

  it('never throws when the runtime refuses to enumerate windows', async () => {
    stubOpenFin(new Error('no permission'));
    await expect(reloadOpenComponents('grid-credit')).resolves.toBe(0);
  });
});

describe('describeReload', () => {
  it('says the change is already showing when a window was reloaded', () => {
    expect(describeReload(2)).toContain('2 open window(s) in place');
    expect(describeReload(2)).toContain('already showing');
  });

  /** Never claim a reload that did not happen. */
  it('says nothing was open rather than implying a refresh', () => {
    expect(describeReload(0)).toContain('Nothing is open to reload');
  });
});
