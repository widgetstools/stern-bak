/**
 * Colour-link + workspace-save wiring on StarGrid — ported from the
 * HostedSsrmMarketsGrid tests when the wrapper collapsed into the front
 * door: gridApi captured via onReady, rowIdField from the container's
 * resolved key column, SSRM defaults injected into the link config, and
 * `Save Workspace` running the toolbar-Save `saveAll` path.
 */
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const captured = vi.hoisted(() => ({
  link: null as Record<string, unknown> | null,
  onWorkspaceSave: undefined as (() => Promise<void> | void) | undefined,
}));

const fakeProvider = vi.hoisted(() => ({
  getSetFilterValues: vi.fn(async () => ['P1']),
}));

const { saveAll, saveActiveProfile } = vi.hoisted(() => ({
  saveAll: vi.fn().mockResolvedValue(undefined),
  saveActiveProfile: vi.fn().mockResolvedValue(undefined),
}));

const { cfgRef } = vi.hoisted(() => ({
  cfgRef: {
    current: { providerId: 'p1', providerType: 'stomp-ssrm', name: 'P' } as Record<string, unknown>,
  },
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useStaruiIdentity: () => ({ appId: 'app', userId: 'user', storage: () => ({}) }),
  useDataProviderConfig: () => ({ cfg: cfgRef.current, loading: false }),
}));

vi.mock('../container/ssrm-markets-grid-container/SsrmMarketsGridContainer.js', () => ({
  SsrmMarketsGridContainer: (props: Record<string, unknown>) => {
    React.useEffect(() => {
      (props.onRowIdFieldChange as ((f: string | null) => void) | undefined)?.('positionId');
      (props.onProviderReady as ((p: unknown) => void) | undefined)?.(fakeProvider);
      (props.onReady as ((h: unknown) => void) | undefined)?.({
        gridApi: { id: 'fake-api' },
        saveAll,
        profiles: { saveActiveProfile },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement('div', { 'data-testid': 'ssrm-container' });
  },
}));

vi.mock('../container/markets-grid-container/MarketsGridContainer.js', () => ({
  MarketsGridContainer: (props: Record<string, unknown>) => {
    React.useEffect(() => {
      (props.onRowIdFieldChange as ((f: unknown) => void) | undefined)?.(['bookId', 'cusip']);
      (props.onReady as ((h: unknown) => void) | undefined)?.({
        gridApi: { id: 'csrm-api' },
        saveAll,
        profiles: { saveActiveProfile },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement('div', { 'data-testid': 'csrm-container' });
  },
}));

vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: () => React.createElement('div', { 'data-testid': 'static-grid' }),
}));

vi.mock('../hosted/useGridContextLink.js', () => ({
  useGridContextLink: (args: Record<string, unknown>) => {
    captured.link = args;
  },
}));

vi.mock('../hosted/useWorkspaceSaveEvent.js', () => ({
  useWorkspaceSaveEvent: (cb: (() => Promise<void> | void) | undefined) => {
    captured.onWorkspaceSave = cb;
  },
}));

vi.mock('../hosted/useGridLinkNotifications.js', () => ({
  useGridLinkNotifications: () => ({ onPublish: vi.fn(), onReceive: vi.fn() }),
}));

vi.mock('../hosted/useInteropChannel.js', () => ({
  useInteropChannel: () => ({ broadcast: vi.fn(), addContextListener: vi.fn(() => () => {}), current: null }),
  isInteropAvailable: () => false,
}));

vi.mock('../hosted/useFdc3Channel.js', () => ({
  useFdc3Channel: () => ({ broadcast: vi.fn(), addContextListener: vi.fn(() => () => {}), current: null }),
}));

import { StarGrid } from './StarGrid.js';

beforeEach(() => {
  captured.link = null;
  captured.onWorkspaceSave = undefined;
  cfgRef.current = { providerId: 'p1', providerType: 'stomp-ssrm', name: 'P' };
  saveAll.mockClear();
  saveActiveProfile.mockClear();
});

afterEach(() => {
  cleanup();
});

const BASE = { gridId: 'g1', providerId: 'p1' };

describe('StarGrid colour-link wiring', () => {
  it('feeds gridApi, keyColumn rowIdField and an SSRM builder into useGridContextLink', async () => {
    render(<StarGrid {...BASE} contextLink={{ enabled: true, mode: 'fields' }} />);
    await waitFor(() => {
      const cfg = captured.link?.config as Record<string, unknown> | undefined;
      expect(cfg?.rowIdField).toBe('positionId');
      expect(typeof cfg?.buildContext).toBe('function');
    });
    await waitFor(() => expect(captured.link?.gridApi).toEqual({ id: 'fake-api' }));
  });

  it('injects the rowId set-filter resolver only in rowId mode', async () => {
    render(<StarGrid {...BASE} contextLink={{ enabled: true, mode: 'rowId' }} />);
    await waitFor(() => {
      const cfg = captured.link?.config as Record<string, unknown> | undefined;
      expect(typeof cfg?.resolve).toBe('function');
    });
  });

  it('leaves resolve unset in fields mode unless the caller supplies one', async () => {
    render(<StarGrid {...BASE} contextLink={{ enabled: true, mode: 'fields' }} />);
    await waitFor(() => expect(captured.link?.config).toBeDefined());
    expect((captured.link?.config as Record<string, unknown>).resolve).toBeUndefined();
  });

  it('a caller-supplied buildContext wins over the SSRM default', async () => {
    const mine = vi.fn(() => null);
    render(
      <StarGrid {...BASE} contextLink={{ enabled: true, mode: 'fields', buildContext: mine }} />,
    );
    await waitFor(() => {
      expect((captured.link?.config as Record<string, unknown>)?.buildContext).toBe(mine);
    });
  });

  it('passes no config when contextLink is omitted (hook inert)', async () => {
    render(<StarGrid {...BASE} />);
    await waitFor(() => expect(captured.link).not.toBeNull());
    expect(captured.link?.config).toBeUndefined();
  });

  it('link identity prefers advanced.instanceId over gridId', async () => {
    render(
      <StarGrid
        {...BASE}
        contextLink={{ enabled: true, mode: 'fields' }}
        advanced={{ instanceId: 'view-7' } as never}
      />,
    );
    await waitFor(() => expect(captured.link?.instanceId).toBe('view-7'));
  });
});

describe('StarGrid CSRM colour-link flavour', () => {
  it('resolves rowIdField from the container without injecting an SSRM builder', async () => {
    cfgRef.current = { providerId: 'p2', providerType: 'stomp', name: 'C' };
    render(<StarGrid gridId="g1" providerId="p2" contextLink={{ enabled: true, mode: 'fields' }} />);
    await waitFor(() => {
      const cfg = captured.link?.config as Record<string, unknown> | undefined;
      expect(cfg?.rowIdField).toEqual(['bookId', 'cusip']);
    });
    const cfg = captured.link?.config as Record<string, unknown>;
    expect(cfg.buildContext).toBeUndefined();
    expect(cfg.resolve).toBeUndefined();
    expect(captured.link?.gridApi).toEqual({ id: 'csrm-api' });
  });
});

describe('StarGrid workspace-save wiring', () => {
  it('runs saveAll through the captured grid handle on Save Workspace', async () => {
    render(<StarGrid {...BASE} />);
    await waitFor(() => expect(typeof captured.onWorkspaceSave).toBe('function'));
    // Wait for the container stub's onReady to deliver the handle.
    await waitFor(() => expect(saveAll).not.toHaveBeenCalled());
    await captured.onWorkspaceSave!();
    expect(saveAll).toHaveBeenCalledTimes(1);
    // saveAll present → the legacy fallback must not double-save.
    expect(saveActiveProfile).not.toHaveBeenCalled();
  });
});
