import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockEnsureConfigReady,
  mockEnsurePlatformReady,
  mockResolvePlatformBootstrapFromJson,
  mockResolvePlatformBootstrapFromManifest,
  mockSetConfigManager,
  resetStaruiMocks,
} from './staruiVitestMocks';

describe('platformBootstrap', () => {
  const config = { userId: 'dev1', appId: 'StarDemoSsrm' };
  const configManager = { init: vi.fn() };
  const platform = { configManager, client: {}, appData: {} };

  beforeEach(() => {
    vi.resetModules();
    resetStaruiMocks();
    mockResolvePlatformBootstrapFromJson.mockResolvedValue(config);
    mockResolvePlatformBootstrapFromManifest.mockResolvedValue(config);
    mockEnsureConfigReady.mockResolvedValue({ configManager });
    mockEnsurePlatformReady.mockResolvedValue(platform);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).fin;
  });

  it('throws when usePlatformBootstrap is called outside provider', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { usePlatformBootstrap } = await import('./platformBootstrap');
    expect(() => renderHook(() => usePlatformBootstrap())).toThrow(
      'requires PlatformBootstrapProvider',
    );
  });

  it('initConfigBootstrap resolves json config in browser', async () => {
    const { initConfigBootstrap } = await import('./platformBootstrap');
    const result = await initConfigBootstrap();

    expect(mockResolvePlatformBootstrapFromJson).toHaveBeenCalledWith('/app-config.json');
    expect(mockEnsureConfigReady).toHaveBeenCalledWith(config);
    expect(mockSetConfigManager).toHaveBeenCalledWith(configManager);
    expect(result).toEqual({ config, configManager });
  });

  it('initConfigBootstrap reuses cached promise', async () => {
    const { initConfigBootstrap } = await import('./platformBootstrap');
    const first = await initConfigBootstrap();
    const second = await initConfigBootstrap();

    expect(first).toBe(second);
    expect(mockResolvePlatformBootstrapFromJson).toHaveBeenCalledTimes(1);
  });

  it('initConfigBootstrap uses manifest in OpenFin runtime', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = { Platform: { getCurrentSync: vi.fn() } };

    vi.resetModules();
    resetStaruiMocks();
    mockResolvePlatformBootstrapFromManifest.mockResolvedValue(config);
    mockEnsureConfigReady.mockResolvedValue({ configManager });

    const { initConfigBootstrap } = await import('./platformBootstrap');
    await initConfigBootstrap();

    expect(mockResolvePlatformBootstrapFromManifest).toHaveBeenCalled();
    expect(mockResolvePlatformBootstrapFromJson).not.toHaveBeenCalled();
  });

  it('initPlatformBootstrap upgrades to full platform', async () => {
    const { initPlatformBootstrap } = await import('./platformBootstrap');
    const result = await initPlatformBootstrap();

    expect(mockEnsurePlatformReady).toHaveBeenCalledWith(config, {
      workerScriptUrl: '/mock-worker.mjs',
    });
    expect(result).toEqual({ config, platform });
    expect(mockSetConfigManager).toHaveBeenCalledWith(configManager);
  });

  it('PlatformBootstrapProvider supplies context', async () => {
    const React = await import('react');
    const { renderHook } = await import('@testing-library/react');
    const {
      PlatformBootstrapProvider,
      usePlatformBootstrap,
    } = await import('./platformBootstrap');

    // Intentional partial mock: the provider only stores and hands back the
    // value, so the hub-bundle surface (ready/stopProvider/…) is never touched.
    const boot = { config, platform } as unknown as import('./platformBootstrap').PlatformBootstrapResult;
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(PlatformBootstrapProvider, { value: boot, children });

    const { result } = renderHook(() => usePlatformBootstrap(), { wrapper });
    expect(result.current).toBe(boot);
  });
});
