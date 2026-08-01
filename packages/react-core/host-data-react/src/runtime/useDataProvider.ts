import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProviderClientAdapter, type IDataProvider } from '@wellsfargo-starui/data';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';
import { useDataServicesContext } from './DataServicesProvider.js';

export interface UseDataProviderOpts {
  /** Draft cfg when the provider row is not in the catalog yet. */
  inlineCfg?: ProviderConfig;
  /** Automatically call `start()` when `providerId` is set. Default `true`. */
  autoStart?: boolean;
  /**
   * Mirror provider status/error into React state (one re-render per
   * transition). Set `false` when the caller ignores `status`/`error`
   * — e.g. wiring hooks that consume provider events directly — so
   * status churn doesn't re-render the host component. `status` stays
   * 'loading' and `error` undefined in that case. Default `true`.
   */
  trackStatus?: boolean;
}

export interface UseDataProviderResult<T = Record<string, unknown>> {
  provider: IDataProvider<T> | null;
  status: ProviderStatus;
  error?: string;
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  restart: (extra?: Record<string, unknown>) => Promise<void>;
}

/**
 * Hub-backed {@link IDataProvider} hook — preferred over legacy
 * {@link useProviderStream} for production grids.
 */
export function useDataProvider<T = Record<string, unknown>>(
  providerId: string | null | undefined,
  opts: UseDataProviderOpts = {},
): UseDataProviderResult<T> {
  const { client } = useDataServicesContext();
  const { inlineCfg, autoStart = true, trackStatus = true } = opts;

  const [status, setStatus] = useState<ProviderStatus>('loading');
  const [error, setError] = useState<string | undefined>(undefined);

  const provider = useMemo(() => {
    if (!providerId) return null;
    return new ProviderClientAdapter<T>({ client, providerId, inlineCfg });
  }, [client, providerId, inlineCfg]);

  const providerRef = useRef(provider);
  providerRef.current = provider;

  useEffect(() => {
    if (!provider) {
      if (trackStatus) {
        setStatus('loading');
        setError(undefined);
      }
      return;
    }

    if (!trackStatus) {
      // Lifecycle only — no status mirroring, no per-transition renders.
      return () => { void provider.stop(); };
    }

    const unsubStatus = provider.onStatus((s: ProviderStatus, err?: string) => {
      setStatus(s);
      setError(err);
    });
    const unsubError = provider.onError((err: Error) => {
      setError(err.message);
      setStatus('error');
    });

    return () => {
      unsubStatus();
      unsubError();
      void provider.stop();
    };
  }, [provider, trackStatus]);

  const start = useCallback(async () => {
    const active = providerRef.current;
    if (!active) return;
    setStatus('loading');
    setError(undefined);
    try {
      await active.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!autoStart || !provider) return;
    let cancelled = false;
    void (async () => {
      try {
        setStatus('loading');
        setError(undefined);
        await provider.start();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [provider, autoStart]);

  const refresh = useCallback(async () => {
    await providerRef.current?.refresh();
  }, []);

  const restart = useCallback(async (extra?: Record<string, unknown>) => {
    const active = providerRef.current;
    if (!active) return;
    setStatus('loading');
    setError(undefined);
    try {
      await active.restart(extra);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
      throw err;
    }
  }, []);

  return { provider, status, error, start, refresh, restart };
}
