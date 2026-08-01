/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity row 8 — full-bleed fixed layout. The wrapper inserts a CSS
 * reset for html/body padding+margin+overflow and a position:fixed
 * flex column that pins the grid to all four corners of the viewport.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

vi.mock('../../container/markets-grid-container/index.js', () => ({
  MarketsGridContainer: () => <div data-testid="mds-stub" />,
}));

const { HostedMarketsGrid } = await import('../HostedMarketsGrid.js');

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
});

describe('HostedMarketsGrid — full-bleed layout (row 8)', () => {
  it('emits a global html/body reset and a position:fixed flex column shell', async () => {
    const { container, getByTestId } = render(
      <HostedMarketsGrid
        gridId="fb-1"
        defaultInstanceId="fb-1"
        componentName="FB"
        configManager={fakeConfigManager}
      />,
    );
    await waitFor(() => getByTestId('mds-stub'));

    const styleEl = container.querySelector('style');
    expect(styleEl?.textContent).toMatch(/html,\s*body/);
    expect(styleEl?.textContent).toMatch(/padding:\s*0/);
    expect(styleEl?.textContent).toMatch(/overflow:\s*hidden/);

    const shell = container.querySelector('div[style*="fixed"]') as HTMLElement | null;
    expect(shell).toBeTruthy();
    expect(shell!.style.position).toBe('fixed');
    expect(shell!.style.flexDirection).toBe('column');
    expect(shell!.style.inset).toBe('0px');

    const inner = shell!.firstElementChild as HTMLElement;
    expect(inner.style.flex).toMatch(/^1\b/);
    expect(inner.style.minHeight).toBe('0px');
  });
});
