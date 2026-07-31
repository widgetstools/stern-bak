/**
 * useProviderProbe — Test Connection + Infer Fields in one hook.
 *
 * Replaces the four per-transport hooks v1 had
 * (useStompConnectionTest / useRestConnectionTest /
 *  useStompFieldInference / useRestFieldInference). The probe
 * functions are pure main-thread helpers exported from
 * `@wellsfargo-starui/host-data` — they share their implementation with the
 * SharedWorker hub but don't require a worker to call.
 */

import { useCallback, useState } from 'react';
import { probeStomp, connectStomp, probeRest, probeMock, inferFields } from '@wellsfargo-starui/host-data';
import { resolveCfg } from '@wellsfargo-starui/host-data/runtime';
import { useAppDataStore } from '@wellsfargo-starui/host-data-react/runtime';
import type { ProviderConfig, FieldNode } from '@wellsfargo-starui/shared-types';

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

export function useProviderProbe(cfg: ProviderConfig | null): ProbeState {
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
    (input: ProviderConfig): ProviderConfig => {
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
      await appDataStore.ready();
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
      await appDataStore.ready();
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
  cfg: ProviderConfig,
  opts: { maxRows: number; timeoutMs: number },
): Promise<{ ok: boolean; rows?: readonly unknown[]; error?: string }> {
  switch (cfg.providerType) {
    case 'stomp': return connectStomp(cfg, { timeoutMs: opts.timeoutMs });
    case 'rest':  return probeRest(cfg);
    case 'mock':  return probeMock(cfg, { maxRows: opts.maxRows });
    case 'appdata': return { ok: true, rows: [] };
    default:      return { ok: false, error: `Test not implemented for ${cfg.providerType}` };
  }
}

/**
 * Field-inference probe — fetches real rows so `inferFields` has data
 * to sample. STOMP runs the full subscribe + trigger + collect path
 * here (unlike the connection test, which only needs the handshake).
 */
async function probeOnce(
  cfg: ProviderConfig,
  opts: { maxRows: number; timeoutMs: number },
): Promise<{ ok: boolean; rows?: readonly unknown[]; error?: string }> {
  switch (cfg.providerType) {
    case 'stomp': return probeStomp(cfg, opts);
    case 'rest':  return probeRest(cfg);
    case 'mock':  return probeMock(cfg, { maxRows: opts.maxRows });
    case 'appdata': return { ok: true, rows: [] };
    default:      return { ok: false, error: `Probe not implemented for ${cfg.providerType}` };
  }
}
