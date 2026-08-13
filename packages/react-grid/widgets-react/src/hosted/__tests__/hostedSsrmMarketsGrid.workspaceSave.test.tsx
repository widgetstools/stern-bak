/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

// Container stub fires onReady on mount with a fake MarketsGridHandle so
// HostedSsrmMarketsGrid can capture it into its ref — the same contract
// SsrmMarketsGridContainer honours (its onReady chain forwards the
// MarketsGrid handle unchanged).
const saveAll = vi.fn().mockResolvedValue(undefined);
const saveActiveProfile = vi.fn().mockResolvedValue(undefined);
const fakeHandle = {
  gridApi: {} as any,
  platform: {} as any,
  saveAll,
  profiles: { saveActiveProfile } as any,
};

vi.mock('../../container/ssrm-markets-grid-container/index.js', () => ({
  SsrmMarketsGridContainer: (props: any) => {
    setTimeout(() => props.onReady?.(fakeHandle), 0);
    return <div data-testid="ssrm-stub" />;
  },
}));

// Capture the onWorkspaceSave callback HostedSsrmMarketsGrid passes in so
// the test can invoke it directly — same shape the platform-side
// dispatch hits on `Save Workspace`.
let capturedOnSave: (() => Promise<void> | void) | undefined;
vi.mock('../useHostedView.js', () => ({
  useHostedView: (args: any) => {
    capturedOnSave = args.onWorkspaceSave;
    return {
      identity: {
        configManager: fakeConfigManager,
        instanceId: 'inst-1',
        appId: 'app-1',
        userId: 'user-1',
        storage: null,
      },
      ready: true,
      agTheme: {} as any,
      tabsHidden: false,
      iab: { subscribe: vi.fn(), publish: vi.fn() },
      linking: {
        color: { color: null, linked: false },
        fdc3: {} as any,
        channel: {} as any,
      },
    };
  },
}));

import { HostedSsrmMarketsGrid } from '../HostedSsrmMarketsGrid.js';

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

beforeEach(() => {
  saveAll.mockClear();
  saveActiveProfile.mockClear();
  capturedOnSave = undefined;
});

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
});

describe('HostedSsrmMarketsGrid — workspace-save wiring', () => {
  it('runs saveAll through the captured grid handle on Save Workspace', async () => {
    const { getByTestId } = render(
      <HostedSsrmMarketsGrid
        providerId="dp-1"
        defaultInstanceId="inst-1"
        componentName="SsrmMarkets"
        configManager={fakeConfigManager}
      />,
    );
    await waitFor(() => getByTestId('ssrm-stub'));
    // Wait for the deferred onReady() in the stub to fire.
    await new Promise((r) => setTimeout(r, 5));

    expect(typeof capturedOnSave).toBe('function');
    await capturedOnSave!();
    expect(saveAll).toHaveBeenCalledTimes(1);
    // saveAll present → the legacy fallback must not double-save.
    expect(saveActiveProfile).not.toHaveBeenCalled();
  });

  it('falls back to profiles.saveActiveProfile for older handle shapes', async () => {
    const originalSaveAll = fakeHandle.saveAll;
    delete (fakeHandle as any).saveAll;
    try {
      const { getByTestId } = render(
        <HostedSsrmMarketsGrid
          providerId="dp-1"
          defaultInstanceId="inst-1"
          componentName="SsrmMarkets"
          configManager={fakeConfigManager}
        />,
      );
      await waitFor(() => getByTestId('ssrm-stub'));
      await new Promise((r) => setTimeout(r, 5));

      await capturedOnSave!();
      expect(saveActiveProfile).toHaveBeenCalledTimes(1);
    } finally {
      (fakeHandle as any).saveAll = originalSaveAll;
    }
  });

  it('is a no-op when onReady has not fired yet', async () => {
    render(
      <HostedSsrmMarketsGrid
        providerId="dp-1"
        defaultInstanceId="inst-1"
        componentName="SsrmMarkets"
        configManager={fakeConfigManager}
      />,
    );
    expect(typeof capturedOnSave).toBe('function');
    await capturedOnSave!();
    expect(saveAll).not.toHaveBeenCalled();
    expect(saveActiveProfile).not.toHaveBeenCalled();
  });

  it('flushes grid state on unmount (workspace drag/move safety net)', async () => {
    const { getByTestId, unmount } = render(
      <HostedSsrmMarketsGrid
        providerId="dp-1"
        defaultInstanceId="inst-1"
        componentName="SsrmMarkets"
        configManager={fakeConfigManager}
      />,
    );
    await waitFor(() => getByTestId('ssrm-stub'));
    await new Promise((r) => setTimeout(r, 5));

    unmount();
    await waitFor(() => expect(saveAll).toHaveBeenCalled());
  });
});
