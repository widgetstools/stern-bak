import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_PLATFORM_BOOTSTRAP } from './PlatformBootstrapConfig.js';
import { _resetWarmPlatformForTests, warmPlatform } from './warmPlatform.js';

const ensurePlatformReadyMock = vi.fn();

vi.mock('./ensurePlatformReady.js', () => ({
  ensurePlatformReady: (...args: unknown[]) => ensurePlatformReadyMock(...args),
}));

function fakeBundle(rows: Array<{ providerId: string; autoStart?: boolean }>) {
  const attachStats = vi.fn(() => 'sub');
  const listProviderConfigs = vi.fn(async () =>
    rows.map((r) => ({ providerId: r.providerId, config: { providerType: 'stomp', autoStart: r.autoStart } })),
  );
  return {
    bundle: {
      catalogReady: Promise.resolve(),
      client: { attachStats },
      platformClient: { listProviderConfigs },
    },
    attachStats,
    listProviderConfigs,
  };
}

describe('warmPlatform', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    _resetWarmPlatformForTests();
    ensurePlatformReadyMock.mockReset();
    vi.restoreAllMocks();
  });

  it('boots the platform through ensurePlatformReady with the same options (one flight with the lazy path)', async () => {
    const { bundle } = fakeBundle([]);
    ensurePlatformReadyMock.mockResolvedValue(bundle);
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP, { workerScriptUrl: '/w.mjs' });
    expect(ensurePlatformReadyMock).toHaveBeenCalledWith(DEV_PLATFORM_BOOTSTRAP, { workerScriptUrl: '/w.mjs' });
  });

  it('starts nothing when no providers are requested', async () => {
    const { bundle, attachStats, listProviderConfigs } = fakeBundle([{ providerId: 'p1', autoStart: true }]);
    ensurePlatformReadyMock.mockResolvedValue(bundle);
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP);
    expect(listProviderConfigs).not.toHaveBeenCalled();
    expect(attachStats).not.toHaveBeenCalled();
  });

  it("'autoStart' warms exactly the catalog rows flagged autoStart, as stats-mode attaches", async () => {
    const { bundle, attachStats } = fakeBundle([
      { providerId: 'p1', autoStart: true },
      { providerId: 'p2' },
      { providerId: 'p3', autoStart: true },
    ]);
    ensurePlatformReadyMock.mockResolvedValue(bundle);
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP, { providers: 'autoStart' });
    expect(attachStats.mock.calls.map((c) => c[0])).toEqual(['p1', 'p3']);
    expect(attachStats.mock.calls[0][1]).toMatchObject({ onStats: expect.any(Function) });
  });

  it('an explicit id list warms those providers without reading the catalog list', async () => {
    const { bundle, attachStats, listProviderConfigs } = fakeBundle([]);
    ensurePlatformReadyMock.mockResolvedValue(bundle);
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP, { providers: ['a', 'b'] });
    expect(listProviderConfigs).not.toHaveBeenCalled();
    expect(attachStats.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('repeat calls are no-ops for providers already warmed', async () => {
    const { bundle, attachStats } = fakeBundle([]);
    ensurePlatformReadyMock.mockResolvedValue(bundle);
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP, { providers: ['a'] });
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP, { providers: ['a', 'b'] });
    expect(attachStats.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('never rejects — a failed boot is logged and left to the lazy path', async () => {
    ensurePlatformReadyMock.mockRejectedValue(new Error('no SharedWorker'));
    await expect(warmPlatform(DEV_PLATFORM_BOOTSTRAP, { providers: 'autoStart' })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('warm-up failed'), expect.any(Error));
  });
});
