import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { applySsrmStatusBar, statusBarSignature, useSsrmStatusBar, withSsrmStatusBar } from './ssrmStatusBar.js';
import { SsrmTotalAndFilteredStatusPanel, SsrmAggregationStatusPanel } from './SsrmStatusPanels.js';

const provider = { id: 'p' } as ISsrmDataProvider;

describe('withSsrmStatusBar', () => {
  it('replaces the built-in count and aggregation panels with provider-backed ones', () => {
    const next = withSsrmStatusBar({
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
        { statusPanel: 'agAggregationComponent', align: 'right' },
      ],
    }, provider);

    expect(next?.statusPanels?.[0]).toMatchObject({
      statusPanel: SsrmTotalAndFilteredStatusPanel,
      align: 'left',
      statusPanelParams: { provider },
    });
    expect(next?.statusPanels?.[1]).toMatchObject({
      statusPanel: SsrmAggregationStatusPanel,
      align: 'right',
    });
  });

  it('leaves unknown panels and an empty bar alone', () => {
    const custom = { statusPanel: vi.fn() };
    expect(withSsrmStatusBar({ statusPanels: [custom] }, provider)?.statusPanels?.[0]).toBe(custom);
    expect(withSsrmStatusBar({ statusPanels: [] }, provider)).toEqual({ statusPanels: [] });
    expect(withSsrmStatusBar(undefined, provider)).toBeUndefined();
  });
});

describe('useSsrmStatusBar', () => {
  it('keeps the remapped bar when only the object identity changed', () => {
    const { result, rerender } = renderHook(
      ({ statusBar }) => useSsrmStatusBar(statusBar, provider),
      {
        initialProps: {
          statusBar: {
            statusPanels: [{ statusPanel: 'agTotalRowCountComponent' }],
          },
        },
      },
    );
    const first = result.current;
    rerender({
      statusBar: {
        statusPanels: [{ statusPanel: 'agTotalRowCountComponent' }],
      },
    });
    expect(result.current).toBe(first);
    expect(statusBarSignature({
      statusPanels: [{ statusPanel: 'agTotalRowCountComponent' }],
    })).toBe('agTotalRowCountComponent@');
    expect(statusBarSignature(undefined)).toBeNull();
    expect(statusBarSignature({ statusPanels: [] })).toBe('');
  });

  it('keeps the last bar when the pipeline omits statusBar', () => {
    const { result, rerender } = renderHook(
      ({ statusBar }) => useSsrmStatusBar(statusBar, provider),
      {
        initialProps: {
          statusBar: {
            statusPanels: [{ statusPanel: 'agSelectedRowCountComponent' }],
          } as { statusPanels: Array<{ statusPanel: string }> } | undefined,
        },
      },
    );
    const first = result.current;
    rerender({ statusBar: undefined });
    expect(result.current).toBe(first);
  });

  it('rebuilds when the enabled panel set changes', () => {
    const { result, rerender } = renderHook(
      ({ statusBar }) => useSsrmStatusBar(statusBar, provider),
      {
        initialProps: {
          statusBar: {
            statusPanels: [{ statusPanel: 'agTotalRowCountComponent' }],
          },
        },
      },
    );
    const first = result.current;
    rerender({
      statusBar: {
        statusPanels: [
          { statusPanel: 'agTotalRowCountComponent' },
          { statusPanel: 'agAggregationComponent', align: 'right' },
        ],
      },
    });
    expect(result.current).not.toBe(first);
    expect(result.current?.statusPanels).toHaveLength(2);
  });
});

describe('applySsrmStatusBar', () => {
  it('pushes the bar and skips when the live value is already that object', () => {
    const bar = { statusPanels: [] };
    const api = {
      setGridOption: vi.fn(),
      getGridOption: vi.fn(() => undefined),
    };
    applySsrmStatusBar(api, bar);
    expect(api.setGridOption).toHaveBeenCalledWith('statusBar', bar);
    api.getGridOption.mockReturnValue(bar);
    applySsrmStatusBar(api, bar);
    expect(api.setGridOption).toHaveBeenCalledTimes(1);
  });
});
