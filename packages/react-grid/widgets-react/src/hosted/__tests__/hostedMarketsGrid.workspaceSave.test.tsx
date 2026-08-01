/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

// Container stub fires onReady on mount with a fake MarketsGridHandle so
// HostedMarketsGrid can capture it into its ref.
const saveActiveProfile = vi.fn().mockResolvedValue(undefined);
const fakeHandle = {
  gridApi: {} as any,
  platform: {} as any,
  profiles: { saveActiveProfile } as any,
};

vi.mock('../../container/markets-grid-container/index.js', () => ({
  MarketsGridContainer: (props: any) => {
    // Mimic real container behavior: onReady fires once after mount.
    setTimeout(() => props.onReady?.(fakeHandle), 0);
    return <div data-testid="mds-stub" />;
  },
}));

// Capture the onWorkspaceSave callback HostedMarketsGrid passes in so
// the test can invoke it directly — same shape the platform-side
// dispatch will hit at runtime.
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

import { HostedMarketsGrid } from '../HostedMarketsGrid.js';

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

beforeEach(() => {
  saveActiveProfile.mockClear();
  capturedOnSave = undefined;
});

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
});

describe('HostedMarketsGrid — workspace-save wiring', () => {
  it('calls saveActiveProfile through the captured grid handle', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="g"
        defaultInstanceId="inst-1"
        componentName="Markets"
        configManager={fakeConfigManager}
      />,
    );
    await waitFor(() => getByTestId('mds-stub'));
    // Wait for the deferred onReady() in the stub to fire.
    await new Promise((r) => setTimeout(r, 5));

    expect(typeof capturedOnSave).toBe('function');
    await capturedOnSave!();
    expect(saveActiveProfile).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when onReady has not fired yet', async () => {
    // Render but invoke onWorkspaceSave before the deferred onReady.
    render(
      <HostedMarketsGrid
        gridId="g"
        defaultInstanceId="inst-1"
        componentName="Markets"
        configManager={fakeConfigManager}
      />,
    );
    expect(typeof capturedOnSave).toBe('function');
    await capturedOnSave!();
    expect(saveActiveProfile).not.toHaveBeenCalled();
  });
});
