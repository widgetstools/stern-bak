/**
 * Cold-start arbitration. This rule decides whether a window restoring into
 * historical mode attaches to the shared provider slot or restarts it with an
 * as-of overlay — and a restart re-snapshots upstream for EVERY window
 * attached to that provider, so getting it backwards is not a local mistake.
 *
 * Both wiring hooks call it, which is the point: before this it lived inline
 * in the client-side hook only, and the server-side one had no arbitration at
 * all — a reloaded historical window attached to whatever the plane happened
 * to hold, i.e. live data under a historical banner.
 */
import { describe, expect, it, vi } from 'vitest';
import { PEER_PROVIDER_WAIT_MS, resolveProviderStartPlan } from './resolveProviderStartPlan.js';

function probe(running: boolean, afterWait = running) {
  return {
    isProviderRunning: vi.fn(async () => running),
    waitForProviderRunning: vi.fn(async () => afterWait),
  };
}

describe('resolveProviderStartPlan', () => {
  it('attaches to a slot that is already running', async () => {
    const p = probe(true);
    await expect(resolveProviderStartPlan(p, 'dp1', '2026-01-02')).resolves.toBe('attach');
    // No peer wait needed — it is already up.
    expect(p.waitForProviderRunning).not.toHaveBeenCalled();
  });

  it('restarts a cold slot when this window wants an as-of overlay', async () => {
    const p = probe(false, false);
    await expect(resolveProviderStartPlan(p, 'dp1', '2026-01-02')).resolves.toBe('restart');
    expect(p.waitForProviderRunning).toHaveBeenCalledWith('dp1', {
      timeoutMs: PEER_PROVIDER_WAIT_MS,
    });
  });

  // The peer race: another window is mid-start against the same overlay.
  // Restarting would yank its snapshot out from under it.
  it('attaches when a peer finishes starting the slot inside the wait', async () => {
    const p = probe(false, true);
    await expect(resolveProviderStartPlan(p, 'dp1', '2026-01-02')).resolves.toBe('attach');
    expect(p.waitForProviderRunning).toHaveBeenCalled();
  });

  it('never waits and never restarts without an as-of date', async () => {
    const p = probe(false, false);
    await expect(resolveProviderStartPlan(p, 'dp1', null)).resolves.toBe('attach');
    // A live cold start connects immediately — hub attach dedupes concurrent
    // windows on its own, and there is no overlay a restart would add.
    expect(p.waitForProviderRunning).not.toHaveBeenCalled();
  });
});
