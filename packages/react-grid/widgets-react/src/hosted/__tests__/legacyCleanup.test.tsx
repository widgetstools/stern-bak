/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity row 15 — one-shot cleanup of legacy
 * `marketsgrid-view-state::*` rows. The wrapper deletes the legacy
 * row exactly once (gated by a localStorage sentinel) regardless of
 * how many hosted grids mount in the page lifetime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

vi.mock('../../container/markets-grid-container/index.js', () => ({
  MarketsGridContainer: () => <div data-testid="mds-stub" />,
}));

const { HostedMarketsGrid } = await import('../HostedMarketsGrid.js');

const SENTINEL = 'hosted-mg.legacy-cleanup';

beforeEach(() => {
  window.localStorage.removeItem(SENTINEL);
});

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  window.localStorage.removeItem(SENTINEL);
});

describe('HostedMarketsGrid — legacy view-state cleanup (row 15)', () => {
  it('calls deleteConfig once, sets the sentinel, and skips on subsequent mounts', async () => {
    const deleteConfig = vi.fn().mockResolvedValue(undefined);
    const cm = { deleteConfig } as unknown as ConfigManager;

    const first = render(
      <HostedMarketsGrid
        gridId="lc-1"
        defaultInstanceId="lc-1"
        componentName="LC"
        configManager={cm}
      />,
    );
    await waitFor(() => first.getByTestId('mds-stub'));
    await waitFor(() => expect(deleteConfig).toHaveBeenCalledTimes(1));

    expect(deleteConfig).toHaveBeenCalledWith('marketsgrid-view-state::lc-1');
    expect(window.localStorage.getItem(SENTINEL)).toBe('1');

    first.unmount();

    // Second mount must observe the sentinel and skip the cleanup.
    const second = render(
      <HostedMarketsGrid
        gridId="lc-2"
        defaultInstanceId="lc-2"
        componentName="LC"
        configManager={cm}
      />,
    );
    await waitFor(() => second.getByTestId('mds-stub'));
    // Give the effect a chance to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(deleteConfig).toHaveBeenCalledTimes(1);
  });
});
