/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAnalysisUrl,
  readHandoff,
  writeHandoff,
  sweepHandoffs,
  openAnalysisPopout,
  reopenAnalysisWindow,
  listAnalysisWindows,
} from './analysisPopout';

const HOUR = 60 * 60_000;

function handoff(over: Record<string, unknown> = {}) {
  return {
    at: Date.now(),
    gridId: 'fi-blotter',
    displayName: 'FI Blotter',
    payload: { kind: 'query' as const, query: { groupBy: ['sector'] } },
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('buildAnalysisUrl', () => {
  it('carries the handoff id and the blotter identity', () => {
    const url = buildAnalysisUrl('abc123', {
      gridId: 'fi-blotter',
      instanceId: 'win-7',
      displayName: 'FI Blotter',
      payload: handoff().payload,
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(url).toContain('#/analysis?');
    expect(params.get('handoff')).toBe('abc123');
    expect(params.get('grid')).toBe('fi-blotter');
    expect(params.get('instance')).toBe('win-7');
    expect(params.get('name')).toBe('FI Blotter');
  });

  it('omits identity params it was not given', () => {
    const url = buildAnalysisUrl('abc123', { payload: handoff().payload });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('grid')).toBeNull();
    expect(params.get('name')).toBeNull();
  });
});

/**
 * The payload goes through storage rather than the URL: a query would fit in a
 * query string, a full report spec would not, and a URL long enough to carry
 * one gets truncated somewhere unhelpful.
 */
describe('the handoff', () => {
  it('round-trips a report spec too large to have been a URL param', () => {
    const blocks = Array.from({ length: 8 }, (_, i) => ({
      kind: 'chart',
      title: `Block ${i} `.repeat(20),
      query: { groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] },
    }));
    writeHandoff('big', handoff({ payload: { kind: 'report', spec: { title: 'Wide', blocks } } }));
    const read = readHandoff('big');
    expect(read?.payload.kind).toBe('report');
    expect(JSON.stringify(read).length).toBeGreaterThan(2000);
  });

  it('returns null for an id that was never written', () => {
    expect(readHandoff('nope')).toBeNull();
  });

  /** The window re-reads its handoff on reload and on every refresh tick, so
   *  a one-shot key would leave a reloaded window blank. */
  it('survives being read more than once', () => {
    writeHandoff('twice', handoff());
    expect(readHandoff('twice')).not.toBeNull();
    expect(readHandoff('twice')).not.toBeNull();
  });

  it('ignores a handoff older than its TTL', () => {
    writeHandoff('stale', handoff({ at: Date.now() - HOUR }));
    expect(readHandoff('stale')).toBeNull();
  });

  it('survives corrupt storage rather than throwing', () => {
    window.localStorage.setItem('starui.analysis.bad', '{not json');
    expect(readHandoff('bad')).toBeNull();
  });

  /** A private window or a storage-blocked context must not take the whole
   *  feature down with it. */
  it('reports failure instead of throwing when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(writeHandoff('x', handoff())).toBe(false);
    spy.mockRestore();
  });
});

describe('sweepHandoffs', () => {
  it('drops expired handoffs and keeps live ones, so the key space stays bounded', () => {
    writeHandoff('old', handoff({ at: Date.now() - HOUR }));
    writeHandoff('new', handoff());
    sweepHandoffs();
    expect(window.localStorage.getItem('starui.analysis.old')).toBeNull();
    expect(window.localStorage.getItem('starui.analysis.new')).not.toBeNull();
  });

  it('leaves keys belonging to anything else alone', () => {
    window.localStorage.setItem('starui.chat.session', 'keep me');
    writeHandoff('old', handoff({ at: Date.now() - HOUR }));
    sweepHandoffs();
    expect(window.localStorage.getItem('starui.chat.session')).toBe('keep me');
  });
});

describe('openAnalysisPopout', () => {
  function fakeRuntime() {
    return { openSurface: vi.fn().mockResolvedValue(undefined) };
  }

  it('stages the payload and opens the url that reads it back', async () => {
    const runtime = fakeRuntime();
    await openAnalysisPopout(runtime as never, {
      gridId: 'fi-blotter',
      displayName: 'FI Blotter',
      payload: { kind: 'query', query: { groupBy: ['sector'] } },
    });

    const surface = runtime.openSurface.mock.calls[0][0];
    const id = new URLSearchParams(surface.url.split('?')[1]).get('handoff')!;
    expect(readHandoff(id)?.payload).toEqual({ kind: 'query', query: { groupBy: ['sector'] } });
  });

  /** One analysis window per blotter — a second open re-targets it rather than
   *  stacking windows the user then has to close one by one. */
  it('names the window per blotter, so a second open re-targets the first', async () => {
    const runtime = fakeRuntime();
    const opts = { gridId: 'fi-blotter', payload: { kind: 'query' as const, query: {} } };
    await openAnalysisPopout(runtime as never, opts);
    await openAnalysisPopout(runtime as never, opts);
    const [first, second] = runtime.openSurface.mock.calls.map((c) => c[0].windowName);
    // The id is part of the name now, so several windows can coexist; the
    // default `main` keeps the old one-window-per-blotter behaviour.
    expect(first).toBe('analysis-fi-blotter-main');
    expect(second).toBe(first);
  });

  /** Two blotters each asking for their own analysis must get two windows. */
  it('gives a different blotter its own window', async () => {
    const runtime = fakeRuntime();
    await openAnalysisPopout(runtime as never, { gridId: 'a', payload: { kind: 'query', query: {} } });
    await openAnalysisPopout(runtime as never, { gridId: 'b', payload: { kind: 'query', query: {} } });
    const [first, second] = runtime.openSurface.mock.calls.map((c) => c[0].windowName);
    expect(first).not.toBe(second);
  });

  /** Asking for a different window must give a genuinely separate one, so two
   *  cuts of the same book can sit side by side. */
  it('gives a distinct window per windowId on the same blotter', async () => {
    const runtime = fakeRuntime();
    await openAnalysisPopout(runtime as never, { gridId: 'fi-blotter', payload: { kind: 'query', query: {} } });
    await openAnalysisPopout(runtime as never, {
      gridId: 'fi-blotter',
      windowId: 'w2',
      payload: { kind: 'query', query: {} },
    });
    const [first, second] = runtime.openSurface.mock.calls.map((c) => c[0].windowName);
    expect(first).not.toBe(second);
    expect(second).toBe('analysis-fi-blotter-w2');
  });

  /** The window reads its own id off the URL so it can badge itself — two
   *  windows on screen would otherwise be indistinguishable. */
  it('puts an additional window\'s id on the url, and leaves the main one bare', async () => {
    const runtime = fakeRuntime();
    await openAnalysisPopout(runtime as never, {
      gridId: 'fi-blotter',
      windowId: 'w2',
      payload: { kind: 'query', query: {} },
    });
    await openAnalysisPopout(runtime as never, { gridId: 'fi-blotter', payload: { kind: 'query', query: {} } });
    const [extra, main] = runtime.openSurface.mock.calls.map((c) => new URLSearchParams(c[0].url.split('?')[1]));
    expect(extra.get('w')).toBe('w2');
    expect(main.get('w')).toBeNull();
  });

  /** A second analysis must never read the first one's spec. */
  it('mints a fresh handoff id per open', async () => {
    const runtime = fakeRuntime();
    const opts = { gridId: 'fi-blotter', payload: { kind: 'query' as const, query: {} } };
    await openAnalysisPopout(runtime as never, opts);
    await openAnalysisPopout(runtime as never, opts);
    const ids = runtime.openSurface.mock.calls.map((c) => new URLSearchParams(c[0].url.split('?')[1]).get('handoff'));
    expect(ids[0]).not.toBe(ids[1]);
  });

  /** It exists for the width — the chat panel's ~337px is the problem it
   *  solves, so opening small would defeat the point. */
  it('opens wide enough to be worth opening', async () => {
    const runtime = fakeRuntime();
    await openAnalysisPopout(runtime as never, { gridId: 'g', payload: { kind: 'query', query: {} } });
    expect(runtime.openSurface.mock.calls[0][0].width).toBeGreaterThanOrEqual(1280);
  });
});

/**
 * Reopening has to work from what the window was LAST SHOWING, because the
 * handoff that carried the spec expires after ten minutes — deliberately, to
 * bound the key space — which is right about when someone asks for the report
 * they closed.
 */
describe('reopenAnalysisWindow', () => {
  function fakeRuntime() {
    return { openSurface: vi.fn().mockResolvedValue(undefined) };
  }

  // Reopening goes through `openAnalysisSurface`, which takes the browser path
  // outside OpenFin. jsdom's `window.open` returns null, which the code
  // correctly reads as "the browser blocked the pop-up" — so it has to be
  // stubbed for these tests to exercise anything past that check.
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue({ focus: vi.fn() } as unknown as Window);
  });

  const REPORT = {
    kind: 'report' as const,
    spec: { title: 'Desk close', blocks: [{ kind: 'commentary' as const, text: 'Steady.' }] },
  };

  async function open(over: Record<string, unknown> = {}) {
    await openAnalysisPopout(fakeRuntime() as never, {
      gridId: 'fi-blotter',
      displayName: 'FI Blotter',
      windowTitle: 'Desk close',
      payload: REPORT,
      ...over,
    } as never);
  }

  it('records what the window was showing so it can be rebuilt', async () => {
    await open();
    expect(listAnalysisWindows('fi-blotter')[0]).toMatchObject({ id: 'main', title: 'Desk close' });
    expect(listAnalysisWindows('fi-blotter')[0].payload).toEqual(REPORT);
  });

  /** The whole point: the spec is gone from the handoff, and reopening still
   *  restores the report rather than needing it re-sent. */
  it('reopens from the record after every handoff has expired', async () => {
    await open();
    // Age out every handoff, exactly as the TTL would.
    sweepHandoffs(Date.now() + 60 * 60_000);
    const outcome = await reopenAnalysisWindow({ gridId: 'fi-blotter', windowId: 'main' });
    expect(outcome.ok).toBe(true);
  });

  /** A fresh handoff id each time means the URL always differs, so the runtime
   *  genuinely navigates instead of no-opping on an identical address — which
   *  is what makes one operation serve as both reload and reopen. */
  it('stages a new handoff so an already-open window actually remounts', async () => {
    await open();
    const first = listAnalysisWindows('fi-blotter')[0].openedAt;
    const outcome = await reopenAnalysisWindow({ gridId: 'fi-blotter' });
    expect(outcome.ok).toBe(true);
    expect(listAnalysisWindows('fi-blotter')[0].openedAt).toBeGreaterThanOrEqual(first);
  });

  it('reports the windows that exist when asked for one that does not', async () => {
    await open();
    const outcome = await reopenAnalysisWindow({ gridId: 'fi-blotter', windowId: 'w9' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain('w9');
      expect(outcome.known.map((w) => w.id)).toEqual(['main']);
    }
  });

  it('reports nothing known for a blotter that has never opened one', async () => {
    const outcome = await reopenAnalysisWindow({ gridId: 'other-blotter' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.known).toEqual([]);
  });

  /** Windows are per blotter, so one blotter's record must never satisfy a
   *  reload aimed at another. */
  it('does not reopen another blotter\'s window', async () => {
    await open({ gridId: 'fi-blotter' });
    const outcome = await reopenAnalysisWindow({ gridId: 'credit-blotter', windowId: 'main' });
    expect(outcome.ok).toBe(false);
  });
});
