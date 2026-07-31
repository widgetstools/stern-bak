import { beforeEach, describe, expect, it, vi } from 'vitest';

const launchApp = vi.fn();
const homeRegister = vi.fn();

vi.mock('./launch.js', () => ({
  launchApp: (...args: unknown[]) => launchApp(...args),
}));

vi.mock('@openfin/workspace', () => ({
  CLITemplate: { SimpleText: 'SimpleText' },
  Home: {
    register: (...args: unknown[]) => homeRegister(...args),
  },
}));

const { registerHome } = await import('./home.js');

const settings = { id: 'home', title: 'Home', icon: 'icon.png' };

function app(over: Record<string, unknown> = {}) {
  return {
    appId: 'a1',
    title: 'Trade',
    description: 'desc',
    manifest: 'http://x',
    manifestType: 'view',
    icons: [{ src: 'icon.svg' }],
    ...over,
  };
}

describe('registerHome', () => {
  beforeEach(() => {
    homeRegister.mockReset();
    homeRegister.mockResolvedValue({ clientId: 'h1' });
    launchApp.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('registers a Home provider and returns its meta', async () => {
    const meta = await registerHome(settings as never, [app()] as never);
    expect(meta).toEqual({ clientId: 'h1' });
    expect(homeRegister).toHaveBeenCalledTimes(1);
  });

  it('returns empty results for slash-prefixed queries', async () => {
    await registerHome(settings as never, [app()] as never);
    const provider = homeRegister.mock.calls[0][0];
    await expect(
      provider.onUserInput({ query: '/help' }, {}),
    ).resolves.toEqual({ results: [] });
  });

  it('maps apps to search entries with type-specific labels', async () => {
    await registerHome(settings as never, [
      app({ appId: 'v', manifestType: 'view' }),
      app({ appId: 's', manifestType: 'snapshot' }),
      app({ appId: 'm', manifestType: 'manifest' }),
      app({ appId: 'e', manifestType: 'external', icons: [] }),
    ] as never);
    const provider = homeRegister.mock.calls[0][0];
    const { results } = await provider.onUserInput({ query: 'trade' }, {});
    expect(results.map((r: { label: string }) => r.label)).toEqual([
      'View',
      'Snapshot',
      'App',
      'Native App',
    ]);
    expect(results[0].icon).toBe('icon.svg');
    expect(results[3].icon).toBeUndefined();
  });

  it('launches when result data is present and warns when absent', async () => {
    const a = app();
    await registerHome(settings as never, [a] as never);
    const provider = homeRegister.mock.calls[0][0];

    await provider.onResultDispatch({ data: a });
    expect(launchApp).toHaveBeenCalledWith(a);

    await provider.onResultDispatch({});
    expect(console.warn).toHaveBeenCalledWith(
      'Unable to execute result without data being passed',
    );
  });
});
