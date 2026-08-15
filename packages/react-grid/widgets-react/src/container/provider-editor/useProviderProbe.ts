/**
 * useProviderProbe — Test Connection + Infer Fields in one hook.
 *
 * Replaces the four per-transport hooks v1 had
 * (useStompConnectionTest / useRestConnectionTest /
 *  useStompFieldInference / useRestFieldInference). The probe
 * functions are pure main-thread helpers exported from
 * `@wellsfargo-starui/data` — they share their implementation with the
 * SharedWorker hub but don't require a worker to call.
 */

import { useCallback, useState } from 'react';
import { probeStomp, connectStomp, probeRest, probeMock, inferFields } from '@wellsfargo-starui/data';
import { resolveCfg } from '@wellsfargo-starui/data/runtime';
import { useAppDataStore } from '@wellsfargo-starui/react/data/runtime';
import type { TransportConfig, FieldNode } from '@wellsfargo-starui/types/shared';

/**
 * How long the probe path waits for AppData to hydrate before giving up
 * and going ahead anyway.
 *
 * AppData is a *nicety* here — it only supplies values for `{{name.key}}`
 * tokens in the config. But `AppDataMirror.ready()` resolves solely when
 * the hub's `appdata-snapshot` arrives, and `attach()` is fire-and-forget:
 * no timeout, no retry, no reject path. So when that snapshot never landed
 * (worker busy, attach lost, port recycled) `await ready()` never settled,
 * and because it sits BEFORE the probe dispatch, `connectStomp`'s own 10s
 * timeout was never reached either — the editor's Test Connection button
 * sat on "Connecting…" indefinitely with no error. Browser-confirmed still
 * spinning at 30s.
 *
 * Bounding it degrades gracefully: an unresolved token reads as `undefined`,
 * exactly as it does on any pre-hydration read, and the probe's own timeout
 * governs from there.
 */
const APPDATA_READY_TIMEOUT_MS = 3_000;

/** `store.ready()`, but never pending for longer than the timeout above.
 *  Always resolves — a rejected `ready()` is as non-fatal as a slow one. */
function readyOrTimeout(store: { ready(): Promise<void> }): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, APPDATA_READY_TIMEOUT_MS);
    const settle = () => {
      clearTimeout(timer);
      resolve();
    };
    try {
      void store.ready().then(settle, settle);
    } catch {
      settle();
    }
  });
}

export interface ProbeState {
  testing: boolean;
  testResult: { success: boolean; rowCount?: number; error?: string } | null;
  inferring: boolean;
  inferredFields: FieldNode[];
  inferenceSummary: { rowsFetched: number; rowsUsed: number; fieldsDetected: number } | null;
  inferenceError: string | null;
  test(): Promise<void>;
  infer(opts?: { sampleSize?: number }): Promise<void>;
  reset(): void;
}

export function useProviderProbe(cfg: TransportConfig | null): ProbeState {
  const { store: appDataStore } = useAppDataStore();
  const [state, setState] = useState<Omit<ProbeState, 'test' | 'infer' | 'reset'>>({
    testing: false,
    testResult: null,
    inferring: false,
    inferredFields: [],
    inferenceSummary: null,
    inferenceError: null,
  });

  const resolveAppDataTokens = useCallback(
    (input: TransportConfig): TransportConfig => {
      // Probe path bypasses the React useResolvedCfg pipeline, so we
      // expand `{{name.key}}` against the AppData snapshot here.
      // `[bracket]` tokens are still resolved inside probeStomp.
      return resolveCfg(input, (name, key) => appDataStore.get(name, key));
    },
    [appDataStore],
  );

  const test = useCallback(async () => {
    if (!cfg) return;
    setState((s) => ({ ...s, testing: true, testResult: null }));
    try {
      await readyOrTimeout(appDataStore);
      const result = await testConnectionOnce(resolveAppDataTokens(cfg), { maxRows: 5, timeoutMs: 10_000 });
      setState((s) => ({
        ...s,
        testing: false,
        testResult: result.ok
          // STOMP's pure-connect test returns no rows, so `rowCount`
          // stays undefined and the pill shows just "Connected". Probe
          // transports (REST/mock) still report the rows they fetched.
          ? { success: true, rowCount: result.rows?.length }
          : { success: false, error: result.error },
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        testing: false,
        testResult: { success: false, error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, [cfg, appDataStore, resolveAppDataTokens]);

  const infer = useCallback(async (opts: { sampleSize?: number } = {}) => {
    if (!cfg) return;
    const sampleSize = opts.sampleSize ?? 200;
    setState((s) => ({ ...s, inferring: true, inferenceError: null }));
    try {
      await readyOrTimeout(appDataStore);
      const fetchSize = Math.min(Math.max(sampleSize * 2, sampleSize + 50), 1000);
      const result = await probeOnce(resolveAppDataTokens(cfg), { maxRows: fetchSize, timeoutMs: 30_000 });
      if (!result.ok) {
        setState((s) => ({ ...s, inferring: false, inferenceError: result.error ?? 'probe failed' }));
        return;
      }
      const { fields, rowsFetched, rowsUsed } = inferFields(result.rows ?? [], { targetSampleSize: sampleSize });
      setState((s) => ({
        ...s,
        inferring: false,
        inferredFields: fields,
        inferenceSummary: { rowsFetched, rowsUsed, fieldsDetected: fields.length },
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        inferring: false,
        inferenceError: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [cfg, appDataStore, resolveAppDataTokens]);

  const reset = useCallback(() => {
    setState({
      testing: false,
      testResult: null,
      inferring: false,
      inferredFields: [],
      inferenceSummary: null,
      inferenceError: null,
    });
  }, []);

  return { ...state, test, infer, reset };
}

/**
 * Test Connection dispatcher. STOMP uses `connectStomp` — a pure socket
 * connection test that resolves on the broker handshake without
 * subscribing, publishing a trigger, or waiting for rows. Other
 * transports reuse their data probe (REST does an HTTP GET, mock
 * synthesises rows), which doubles as a reachability check.
 */
async function testConnectionOnce(
  cfg: TransportConfig,
  opts: { maxRows: number; timeoutMs: number },
): Promise<{ ok: boolean; rows?: readonly unknown[]; error?: string }> {
  switch (cfg.providerType) {
    case 'stomp':
    case 'stomp-ssrm':
      return connectStomp(cfg as never, { timeoutMs: opts.timeoutMs });
    case 'rest':  return probeRest(cfg);
    case 'mock':
    case 'mock-ssrm':
      return probeMock(cfg, { maxRows: opts.maxRows });
    case 'appdata': return { ok: true, rows: [] };
    default:      return { ok: false, error: `Test not implemented for ${(cfg as { providerType?: string }).providerType}` };
  }
}

/**
 * Field-inference probe — fetches real rows so `inferFields` has data
 * to sample. STOMP runs the full subscribe + trigger + collect path
 * here (unlike the connection test, which only needs the handshake).
 */
async function probeOnce(
  cfg: TransportConfig,
  opts: { maxRows: number; timeoutMs: number },
): Promise<{ ok: boolean; rows?: readonly unknown[]; error?: string }> {
  switch (cfg.providerType) {
    case 'stomp':
    case 'stomp-ssrm':
      return probeStomp(cfg as never, opts);
    case 'rest':  return probeRest(cfg);
    case 'mock':
    case 'mock-ssrm':
      return probeMock(cfg, { maxRows: opts.maxRows });
    case 'appdata': return { ok: true, rows: [] };
    default:      return { ok: false, error: `Probe not implemented for ${(cfg as { providerType?: string }).providerType}` };
  }
}
