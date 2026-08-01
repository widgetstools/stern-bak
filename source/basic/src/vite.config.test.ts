/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@wellsfargo-starui/platform/scripts/staruiConsumerVite.mjs', () => ({
  staruiConsumerViteConfig: () => ({
    resolve: { alias: {} },
  }),
  appDirFromConfig: () => '/mock/app',
}));

vi.mock('@vitejs/plugin-react', () => ({
  default: () => ({ name: 'vite:react' }),
}));

describe('vite.config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports a valid vite config with react plugin and dev server', async () => {
    const { default: config } = await import('../vite.config');
    expect(config).toBeDefined();
    expect(config.plugins).toBeDefined();
    expect(Array.isArray(config.plugins)).toBe(true);
    expect(typeof config.server?.port).toBe('number');
    expect(config.server!.port).toBeGreaterThan(0);
  });
});
