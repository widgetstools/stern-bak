/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { dispatchTool, type ToolExecutionContext } from './useToolExecutor';

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({ useDataServices: vi.fn() }));

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
  deriveTemplateConfigId: (type: string, sub: string) => `${type}-${sub}`.toLowerCase(),
}));

/** The window is opened for real in the app; here we only care what it was
 *  asked to show. */
const mockOpen = vi.fn();
const mockReopen = vi.fn();
vi.mock('../analysisPopout', () => ({
  openAnalysisSurface: (...args: unknown[]) => mockOpen(...args),
  // A module mock replaces the module WHOLE, so every export reportTools
  // reaches for has to be here or it is undefined at call time.
  listAnalysisWindows: () => [],
  nextWindowId: () => 'w2',
  MAIN_WINDOW_ID: 'main',
  reopenAnalysisWindow: (...args: unknown[]) => mockReopen(...args),
}));

const GRID_ENTRY = {
  id: 'grid-test', configId: 'grid-test', componentType: 'grid', componentSubType: 'test',
  displayName: 'TestGrid', hostUrl: '/#/blotters/marketsgrid', iconId: '', createdAt: '',
  type: 'internal' as const, usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '',
  singleton: true, asWindow: false,
};

function ctx(): ToolExecutionContext {
  return {
    configManager: {
      profiles: {
        list: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        loadGridLevelData: vi.fn().mockResolvedValue({ provider: { liveProviderId: 'p1' } }),
        saveGridLevelData: vi.fn().mockResolvedValue(undefined),
      },
      findByComponentType: vi.fn().mockResolvedValue([]),
    } as unknown as ConfigManager,
    configStore: {
      get: vi.fn().mockResolvedValue({
        providerId: 'p1', name: 'Positions Feed', providerType: 'mock',
        config: {
          columnDefinitions: [
            { field: 'ticker', headerName: 'Ticker' },
            { field: 'sector', headerName: 'Sector' },
            { field: 'marketValue', headerName: 'Market Value' },
            { field: 'tradeTime', headerName: 'Trade Time' },
          ],
        },
      }),
      list: vi.fn().mockResolvedValue([]),
    } as unknown as DataProviderConfigStore,
    appId: 'Star-Demo',
  };
}

/** What the window was handed. */
function shownSpec() {
  const payload = mockOpen.mock.calls[0][0].payload;
  return payload.kind === 'report' ? payload.spec : null;
}

beforeEach(() => {
  mockOpen.mockReset();
  mockOpen.mockResolvedValue({ ok: true });
  mockReopen.mockReset();
  mockReopen.mockResolvedValue({ ok: true, record: { id: 'main', title: 'Desk close', openedAt: 1 } });
  mockLoadRegistryConfig.mockReset();
  mockLoadRegistryConfig.mockResolvedValue({ entries: [GRID_ENTRY] });
});

describe('open_analysis_window', () => {
  it('opens the window with the query it was given', async () => {
    const result = await dispatchTool('open_analysis_window', ctx(), {
      targetGridId: 'grid-test',
      query: { groupBy: ['sector'] },
    });
    expect(result.ok).toBe(true);
    expect(mockOpen.mock.calls[0][0].payload).toMatchObject({ kind: 'query', query: { groupBy: ['sector'] } });
  });

  /**
   * The window RE-RUNS the query rather than displaying a snapshot, so its
   * numbers are current rather than a copy of an earlier answer. Saying so is
   * what stops the two being confused when they differ.
   */
  it('says the numbers are re-run rather than copied from an earlier result', async () => {
    const result = await dispatchTool('open_analysis_window', ctx(), {
      targetGridId: 'grid-test',
      query: {},
    });
    expect(result.summary.toLowerCase()).toContain('runs the query itself');
  });

  /** The default is still one window per blotter — a second report replaces
   *  the first rather than piling up windows the user has to close. */
  it('reuses the blotter\'s main window unless asked otherwise', async () => {
    await dispatchTool('open_analysis_window', ctx(), { targetGridId: 'grid-test', query: {} });
    expect(mockOpen.mock.calls[0][0].windowId).toBe('main');
  });

  /** "Open another one" has to mean another one — and the reply must name it,
   *  because that id is how the assistant updates that window later. */
  it('opens an additional window on request and reports its id', async () => {
    const result = await dispatchTool('open_analysis_window', ctx(), {
      targetGridId: 'grid-test',
      query: {},
      newWindow: true,
    });
    expect(mockOpen.mock.calls[0][0].windowId).toBe('w2');
    expect(result.summary).toContain('w2');
  });

  it('targets a named window when one is given, over newWindow', async () => {
    await dispatchTool('open_analysis_window', ctx(), {
      targetGridId: 'grid-test',
      query: {},
      windowId: 'w5',
      newWindow: true,
    });
    expect(mockOpen.mock.calls[0][0].windowId).toBe('w5');
  });

  it('refuses an unknown grid with an actionable message', async () => {
    mockLoadRegistryConfig.mockResolvedValue({ entries: [] });
    const result = await dispatchTool('open_analysis_window', ctx(), { targetGridId: 'nope', query: {} });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('list_grids');
  });

  it('reports a blocked window rather than claiming success', async () => {
    mockOpen.mockResolvedValue({ ok: false, error: 'blocked' });
    const result = await dispatchTool('open_analysis_window', ctx(), { targetGridId: 'grid-test', query: {} });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('blocked');
  });
});

describe('create_live_report', () => {
  const REPORT = {
    targetGridId: 'grid-test',
    title: 'Desk close',
    blocks: [
      { kind: 'kpis', query: {}, tiles: [{ label: 'Total', column: 'market value' }] },
      { kind: 'commentary', text: 'Concentrated in Tech.' },
    ],
  };

  it('opens a validated report over the named blotter', async () => {
    const result = await dispatchTool('create_live_report', ctx(), REPORT);
    expect(result.ok).toBe(true);
    expect(shownSpec()?.title).toBe('Desk close');
  });

  /**
   * Column arguments arrive in the USER'S words, same as every other column
   * tool. Resolving before the window opens means a typo is one message the
   * model can act on rather than a block that silently draws nothing.
   */
  it('resolves column names in the user\'s words to real colIds', async () => {
    await dispatchTool('create_live_report', ctx(), REPORT);
    expect(shownSpec()?.blocks[0].tiles[0].column).toBe('marketValue');
  });

  it('resolves a lane\'s axis and every lane column', async () => {
    await dispatchTool('create_live_report', ctx(), {
      ...REPORT,
      blocks: [
        {
          kind: 'lanes',
          query: {},
          axis: 'Trade Time',
          lanes: [{ label: 'MV', column: 'Market Value', mark: 'bars' }],
        },
      ],
    });
    const block = shownSpec()?.blocks[0];
    expect(block.axis).toBe('tradeTime');
    expect(block.lanes[0].column).toBe('marketValue');
  });

  it('resolves columns inside a block\'s filter, aggregate and sort', async () => {
    await dispatchTool('create_live_report', ctx(), {
      ...REPORT,
      blocks: [
        {
          kind: 'chart',
          query: {
            groupBy: ['Sector'],
            filter: [{ column: 'Market Value', op: 'gt', value: 0 }],
            aggregate: [{ column: 'Market Value', fn: 'sum' }],
            sortBy: { column: 'Market Value', direction: 'desc' },
          },
        },
      ],
    });
    const q = shownSpec()?.blocks[0].query;
    expect(q.groupBy).toEqual(['sector']);
    expect(q.filter[0].column).toBe('marketValue');
    expect(q.aggregate[0].column).toBe('marketValue');
    expect(q.sortBy.column).toBe('marketValue');
  });

  it('names a column it cannot resolve instead of opening a broken report', async () => {
    const result = await dispatchTool('create_live_report', ctx(), {
      ...REPORT,
      blocks: [{ kind: 'kpis', query: {}, tiles: [{ label: 'X', column: 'notAColumn' }] }],
    });
    expect(result.ok).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('rejects an invalid spec before opening anything', async () => {
    const result = await dispatchTool('create_live_report', ctx(), { targetGridId: 'grid-test', title: '', blocks: [] });
    expect(result.ok).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  /** There is nowhere in the vocabulary to put markup, and a block that tries
   *  keeps only the fields the vocabulary defines. */
  it('carries no model-supplied markup through to the window', async () => {
    await dispatchTool('create_live_report', ctx(), {
      ...REPORT,
      blocks: [{ kind: 'commentary', text: 'Fine.', html: '<script>alert(1)</script>' }],
    });
    expect(JSON.stringify(shownSpec())).not.toContain('script');
  });

  it('reports the cadence it actually applied, not the one it was asked for', async () => {
    const result = await dispatchTool('create_live_report', ctx(), { ...REPORT, refreshMs: 100 });
    // Clamped up to the 5s floor — telling the user "every 0s" would be a lie.
    expect(result.summary).toContain('every 5s');
  });

  it('describes a report with no cadence as static', async () => {
    const result = await dispatchTool('create_live_report', ctx(), REPORT);
    expect(result.summary).toContain('static');
  });
});

/**
 * Reload and reopen are ONE tool on purpose: every open stages a fresh handoff,
 * so a window still on screen remounts and one that was closed comes back.
 * Asking the model to know which case it is in would be asking it something it
 * cannot observe.
 */
describe('reload_analysis_window', () => {
  it('reloads the main window when none is named', async () => {
    const result = await dispatchTool('reload_analysis_window', ctx(), { targetGridId: 'grid-test' });
    expect(result.ok).toBe(true);
    expect(mockReopen.mock.calls[0][0]).toMatchObject({ gridId: 'grid-test', windowId: undefined });
  });

  it('reloads the window it was pointed at', async () => {
    await dispatchTool('reload_analysis_window', ctx(), { targetGridId: 'grid-test', windowId: 'w2' });
    expect(mockReopen.mock.calls[0][0].windowId).toBe('w2');
  });

  /** It re-runs rather than restoring a snapshot, and the reply has to say so
   *  or the user assumes they are looking at the earlier numbers. */
  it('says the numbers are current rather than what the window showed before', async () => {
    const result = await dispatchTool('reload_analysis_window', ctx(), { targetGridId: 'grid-test' });
    expect(result.summary).toContain('current as of now');
  });

  it('mentions that a closed window has been reopened', async () => {
    const result = await dispatchTool('reload_analysis_window', ctx(), { targetGridId: 'grid-test' });
    expect(result.summary.toLowerCase()).toContain('open again');
  });

  /**
   * The model cannot see the window list, so a bare "not found" leaves it
   * guessing at ids. Naming what exists is what makes the failure actionable.
   */
  it('lists the windows that do exist when asked for one that does not', async () => {
    mockReopen.mockResolvedValue({
      ok: false,
      error: 'No analysis window "w9" has been opened for this blotter.',
      known: [{ id: 'main', title: 'Desk close', openedAt: 1 }, { id: 'w2', title: 'Risk', openedAt: 2 }],
    });
    const result = await dispatchTool('reload_analysis_window', ctx(), { targetGridId: 'grid-test', windowId: 'w9' });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('"main"');
    expect(result.summary).toContain('Desk close');
    expect(result.summary).toContain('"w2"');
  });

  /** With nothing open yet, the useful answer is what to call instead. */
  it('points at the tools that open one when none has been opened yet', async () => {
    mockReopen.mockResolvedValue({ ok: false, error: 'No analysis window "main" has been opened for this blotter.', known: [] });
    const result = await dispatchTool('reload_analysis_window', ctx(), { targetGridId: 'grid-test' });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('open_analysis_window');
    expect(result.summary).toContain('create_live_report');
  });

  it('refuses an unknown grid with an actionable message', async () => {
    mockLoadRegistryConfig.mockResolvedValue({ entries: [] });
    const result = await dispatchTool('reload_analysis_window', ctx(), { targetGridId: 'nope' });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('list_grids');
  });
});
