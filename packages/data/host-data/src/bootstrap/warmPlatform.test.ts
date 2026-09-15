import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_PLATFORM_BOOTSTRAP } from './PlatformBootstrapConfig.js';
import { _resetWarmPlatformForTests, warmPlatform } from './warmPlatform.js';

const ensurePlatformReadyMock = vi.fn();

vi.mock('./ensurePlatformReady.js', () => ({
  ensurePlatformReady: (...args: unknown[]) => ensurePlatformReadyMock(...args),
}));

function fakeBundle(rows: Array<{ providerId: string; autoStart?: boolean; providerType?: string }>) {
  const attachStats = vi.fn(() => 'sub');
  const listProviderConfigs = vi.fn(async () =>
    rows.map((r) => ({
      providerId: r.providerId,
      config: { providerType: r.providerType ?? 'stomp', autoStart: r.autoStart },
    })),
  );
  /** Lines the startup trace wrote, in order. */
  const traced = () =>
    (console.log as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]);
  /** Drive the stats callback the warm-up attach registered for `providerId`. */
  const pushStats = (providerId: string, stats: Record<string, unknown>) => {
    const call = attachStats.mock.calls.find((c) => c[0] === providerId);
    (call?.[1] as { onStats: (s: unknown) => void }).onStats({
      rowCount: 0, byteCount: 0, msgCount: 0, msgPerSec: 0, snapshotFetchMs: null,
      restartRequestMs: null, firstMessageMs: null, publishCount: 0, publishPerSec: 0,
      publishPerMin: 0, subscriberCount: 0, startedAt: 0, lastMessageAt: null, errorCount: 0,
      ...stats,
    });
  };
  return {
    traced,
    pushStats,
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
    vi.spyOn(console, 'log').mockImplementation(() => {});
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

  it('traces which catalog rows are marked autoStart, and their types', async () => {
    // Warm-up used to be silent: the only way to answer "which providers does
    // the dock auto-start?" was to read every catalog row by hand.
    const { bundle, traced } = fakeBundle([
      { providerId: 'p1', autoStart: true, providerType: 'stomp-ssrm' },
      { providerId: 'p2' },
      { providerId: 'p3', autoStart: true },
    ]);
    ensurePlatformReadyMock.mockResolvedValue(bundle);
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP, { providers: 'autoStart' });
    const lines = traced();
    expect(lines.every((l) => l.startsWith('[provider-startup] '))).toBe(true);
    expect(lines.some((l) => l.includes('2 of 3 catalog provider(s) marked autoStart'))).toBe(true);
    expect(lines.some((l) => l.includes('autoStart → p1 (stomp-ssrm)'))).toBe(true);
    expect(lines.some((l) => l.includes('starting 2 of 2 provider(s)'))).toBe(true);
  });

  it('counts the ids it skipped as already warm, not just the new ones', async () => {
    // Otherwise a second dock window looks like it starts nothing at all.
    const { bundle, traced } = fakeBundle([]);
    ensurePlatformReadyMock.mockResolvedValue(bundle);
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP, { providers: ['a'] });
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP, { providers: ['a', 'b'] });
    expect(traced().some((l) => l.includes('starting 1 of 2 provider(s) (1 already warm)'))).toBe(true);
    // ...and only the un-warmed one is actually attached.
    expect(traced().filter((l) => l.includes('attaching in stats mode'))).toHaveLength(2);
  });

  it('distinguishes "not asked to warm anything" from "nothing was flagged"', async () => {
    const { bundle, traced } = fakeBundle([{ providerId: 'p1', autoStart: true }]);
    ensurePlatformReadyMock.mockResolvedValue(bundle);
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP);
    expect(traced().some((l) => l.includes('no provider warm-up requested'))).toBe(true);
  });

  it('traces the provider reaching the hub and its snapshot landing, once each', async () => {
    // The warm-up attach discarded its stats; they are the only view of what
    // an auto-started provider actually does after it is asked to start.
    const { bundle, traced, pushStats } = fakeBundle([{ providerId: 'p1', autoStart: true }]);
    ensurePlatformReadyMock.mockResolvedValue(bundle);
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP, { providers: 'autoStart' });
    pushStats('p1', { rowCount: 0 });
    pushStats('p1', { rowCount: 20_000, snapshotFetchMs: 717 });
    pushStats('p1', { rowCount: 20_001, snapshotFetchMs: 717 });
    const lines = traced();
    expect(lines.filter((l) => l.includes('hub is running it'))).toHaveLength(1);
    const loaded = lines.filter((l) => l.includes('snapshot loaded'));
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toContain('20000 rows in 717ms');
  });

  it('traces a NEW provider error, and does not repeat the standing one', async () => {
    const { bundle, traced, pushStats } = fakeBundle([{ providerId: 'p1', autoStart: true }]);
    ensurePlatformReadyMock.mockResolvedValue(bundle);
    await warmPlatform(DEV_PLATFORM_BOOTSTRAP, { providers: 'autoStart' });
    pushStats('p1', { errorCount: 1, lastError: 'socket closed' });
    pushStats('p1', { errorCount: 1, lastError: 'socket closed' });
    pushStats('p1', { errorCount: 2, lastError: 'broker refused' });
    const errs = traced().filter((l) => l.includes('error ('));
    expect(errs).toHaveLength(2);
    expect(errs[1]).toContain('error (2 total) — broker refused');
  });

  it('never rejects — a failed boot is logged and left to the lazy path', async () => {
    ensurePlatformReadyMock.mockRejectedValue(new Error('no SharedWorker'));
    await expect(warmPlatform(DEV_PLATFORM_BOOTSTRAP, { providers: 'autoStart' })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('warm-up failed'), expect.any(Error));
  });
});
