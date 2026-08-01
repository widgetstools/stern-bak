/**
 * MarketsGridContainer — caption persistence via StorageAdapter
 * `gridLevelData`. The container stores the caption alongside the
 * `ProviderSelection` blob that already records picker state, so
 * caption edits survive reloads on the same ConfigService row that
 * holds the profile-set.
 *
 * To keep mocks small, these tests exercise the "no provider selected"
 * render path — caption + onCaptionChange flow through it identically.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@wellsfargo-starui/core';

// Capture what MarketsGrid sees so tests can assert + invoke
// onCaptionChange.
const lastMarketsGridProps: { current: any } = { current: null };
vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: any) => {
    lastMarketsGridProps.current = props;
    return <div data-testid="markets-grid-stub" data-caption={props.caption ?? ''} />;
  },
  createMarketsGridContainerEventBus: () => ({
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  }),
  MARKETS_GRID_EVENT_CATALOG: [],
  useMarketsGridEventBridge: vi.fn(),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({
    client: {
      isProviderRunning: vi.fn().mockResolvedValue(false),
      waitForProviderRunning: vi.fn().mockResolvedValue(false),
    },
  }),
  useDataProvider: () => ({
    provider: null,
    status: 'loading',
    error: undefined,
    start: vi.fn(),
    refresh: vi.fn(),
    restart: vi.fn(),
  }),
  useAppDataStore: () => ({ store: { set: vi.fn() } }),
  useDataProviderConfig: () => ({ cfg: null, loading: false }),
  useResolvedCfg: () => null,
  useDataProvidersList: () => ({ configs: [] }),
}));

vi.mock('./LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));

import { MarketsGridContainer } from './MarketsGridContainer.js';

function makeAdapter(initial: unknown = null) {
  let current: unknown = initial;
  const adapter: StorageAdapter & { __getSaved: () => unknown } = {
    loadGridLevelData: vi.fn(async () => current),
    saveGridLevelData: vi.fn(async (_id: string, data: unknown) => {
      current = data;
    }),
    __getSaved: () => current,
  } as any;
  return adapter;
}

const baseProps = {
  gridId: 'g1',
  instanceId: 'inst-1',
  appId: 'app-1',
  userId: 'u1',
} as const;

describe('MarketsGridContainer — caption persistence', () => {
  it('hydrates the caption from gridLevelData and forwards it to MarketsGrid', async () => {
    const adapter = makeAdapter({
      liveProviderId: null,
      historicalProviderId: null,
      mode: 'live',
      caption: 'My FX Blotter',
    });
    const storage = vi.fn(() => adapter);

    render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        caption="initial-prop"
      />,
    );

    await waitFor(() => {
      expect(lastMarketsGridProps.current?.caption).toBe('My FX Blotter');
    });
  });

  it('falls back to the prop caption when no persisted value exists', async () => {
    const adapter = makeAdapter(null);
    const storage = vi.fn(() => adapter);

    render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        caption="initial-prop"
      />,
    );

    await waitFor(() => {
      expect(lastMarketsGridProps.current?.caption).toBe('initial-prop');
    });
  });

  it('saves the caption to gridLevelData when onCaptionChange fires', async () => {
    const adapter = makeAdapter(null);
    const storage = vi.fn(() => adapter);

    render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        caption="initial-prop"
      />,
    );

    await waitFor(() => {
      expect(lastMarketsGridProps.current?.onCaptionChange).toBeTypeOf('function');
    });

    // Simulate an inline-edit commit.
    React.act(() => {
      lastMarketsGridProps.current.onCaptionChange('Renamed');
    });

    await waitFor(() => {
      expect(adapter.saveGridLevelData).toHaveBeenCalled();
    });
    const saved = adapter.__getSaved() as { caption?: string };
    expect(saved.caption).toBe('Renamed');
  });

  it('chains a caller-supplied onCaptionChange', async () => {
    const adapter = makeAdapter(null);
    const storage = vi.fn(() => adapter);
    const callerOnCaptionChange = vi.fn();

    render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        caption="initial-prop"
        onCaptionChange={callerOnCaptionChange}
      />,
    );

    await waitFor(() => {
      expect(lastMarketsGridProps.current?.onCaptionChange).toBeTypeOf('function');
    });

    React.act(() => {
      lastMarketsGridProps.current.onCaptionChange('Renamed Again');
    });

    expect(callerOnCaptionChange).toHaveBeenCalledWith('Renamed Again');
  });

  describe('under OpenFin — an external tab rename is adopted', () => {
    afterEach(() => {
      delete (globalThis as any).fin;
    });

    it('keeps the persisted caption on first render but adopts a later prop change (Save Tab As…)', async () => {
      (globalThis as any).fin = {};
      const adapter = makeAdapter({
        liveProviderId: null,
        historicalProviderId: null,
        mode: 'live',
        caption: 'Persisted Name',
      });
      const storage = vi.fn(() => adapter);

      const { rerender } = render(
        <MarketsGridContainer
          {...baseProps}
          storage={storage as any}
          caption="MarketsGrid"
        />,
      );

      // First render: the existing persisted caption is preserved — the
      // initial prop (the componentName fallback) does not shadow it.
      await waitFor(() => {
        expect(lastMarketsGridProps.current?.caption).toBe('Persisted Name');
      });

      // A later prop change models the live tab name updating after a
      // "Save Tab As…" rename — the container adopts it.
      rerender(
        <MarketsGridContainer
          {...baseProps}
          storage={storage as any}
          caption="Renamed Via Tab"
        />,
      );

      await waitFor(() => {
        expect(lastMarketsGridProps.current?.caption).toBe('Renamed Via Tab');
      });
      const saved = adapter.__getSaved() as { caption?: string };
      expect(saved.caption).toBe('Renamed Via Tab');
    });
  });
});
