/**
 * Cold-start arbitration: attach to the running provider, or restart it with
 * an as-of overlay?
 *
 * The hub slot for a provider is shared by every window. A window restoring
 * into historical mode must not attach to a slot a peer started against a
 * different date — but it must not `restart()` either if a peer is *already*
 * starting it against the same one, because a restart re-snapshots upstream
 * and yanks every other window attached to it.
 *
 * So: if the slot is running, attach. If it is not, and this window wants an
 * as-of overlay, give a peer a brief window to finish starting it before
 * taking the restart. Live cold-starts never wait — hub attach dedupes
 * concurrent windows on its own.
 *
 * Extracted from `useProviderDataWiring` when the server-side container
 * needed the same decision for its own restore-on-mount. The RULE is shared;
 * the providers it drives are not (`IDataProvider.start` /
 * `ISsrmDataProvider.start` are different objects behind different wiring
 * hooks), which is the same split the two wiring hooks already are.
 */

/** Historical restore only — brief peer race before a restart. */
export const PEER_PROVIDER_WAIT_MS = 2_000;

export interface ProviderRunningProbe {
  isProviderRunning(providerId: string): Promise<boolean>;
  waitForProviderRunning(
    providerId: string,
    opts: { timeoutMs: number },
  ): Promise<boolean>;
}

/**
 * `'restart'` means "create the slot with `{ asOfDate }`"; `'attach'` means
 * "plain `start()`". Only a window that WANTS an as-of date can ever be told
 * to restart — without one there is nothing a restart would add.
 */
export async function resolveProviderStartPlan(
  probe: ProviderRunningProbe,
  providerId: string,
  asOfDate: string | null,
): Promise<'attach' | 'restart'> {
  let running = await probe.isProviderRunning(providerId);
  if (!running && asOfDate) {
    running = await probe.waitForProviderRunning(providerId, {
      timeoutMs: PEER_PROVIDER_WAIT_MS,
    });
  }
  if (running) return 'attach';
  return asOfDate ? 'restart' : 'attach';
}
