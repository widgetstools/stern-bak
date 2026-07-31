import { beforeEach, describe, expect, it, vi } from 'vitest';

const launchApp = vi.fn();
const storefrontRegister = vi.fn();

vi.mock('./launch.js', () => ({
  launchApp: (...args: unknown[]) => launchApp(...args),
}));

vi.mock('@openfin/workspace', () => ({
  Storefront: {
    register: (...args: unknown[]) => storefrontRegister(...args),
  },
  StorefrontTemplate: { AppGrid: 'AppGrid' },
}));

const { registerStore } = await import('./store.js');

const settings = { id: 'store', title: 'Store', icon: 'icon.png' };

describe('registerStore', () => {
  beforeEach(() => {
    storefrontRegister.mockReset();
    launchApp.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('registers storefront providers that surface apps', async () => {
    const apps = [{ appId: 'a1', title: 'A', manifest: 'm', manifestType: 'view' }];
    const meta = { clientId: 's1' };
    storefrontRegister.mockResolvedValue(meta);

    await expect(registerStore(settings as never, apps as never)).resolves.toBe(meta);

    const provider = storefrontRegister.mock.calls[0][0];
    expect(await provider.getApps()).toEqual(apps);
    expect((await provider.getNavigation())[0].items[0].templateData.apps).toEqual(apps);
    expect((await provider.getLandingPage()).topRow.items[0].image.src).toBe('icon.png');
    expect((await provider.getFooter()).text).toBe('Store');

    await provider.launchApp(apps[0]);
    expect(launchApp).toHaveBeenCalledWith(apps[0]);
  });

  it('returns undefined when Storefront.register throws', async () => {
    storefrontRegister.mockRejectedValue(new Error('boom'));
    await expect(registerStore(settings as never)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
