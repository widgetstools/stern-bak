import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SsrmProviderClientAdapter, type ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';
import { useDataServicesContext } from './DataServicesProvider.js';

export interface UseSsrmDataProviderOpts {
  inlineCfg?: ProviderConfig;
  autoStart?: boolean;
  trackStatus?: boolean;
}

/** Mirrors `UseDataProviderResult` — the container drives either the same way. */
export interface UseSsrmDataProviderResult {
  provider: ISsrmDataProvider | null;
  status: ProviderStatus;
  error?: string;
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  restart: (extra?: Record<string, unknown>) => Promise<void>;
}

export function useSsrmDataProvider(
  providerId: string | null | undefined,
  opts: UseSsrmDataProviderOpts = {},
): UseSsrmDataProviderResult {
  const { client, platformClient } = useDataServicesContext();
  const { inlineCfg, autoStart = true, trackStatus = true } = opts;

  const [status, setStatus] = useState<ProviderStatus>('loading');
  const [error, setError] = useState<string | undefined>(undefined);

  const provider = useMemo(() => {
    if (!providerId) return null;
    return new SsrmProviderClientAdapter({ client, catalogClient: platformClient, providerId, inlineCfg });
  }, [client, platformClient, providerId, inlineCfg]);

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
      return () => { void provider.stop(); };
    }
    const unsubStatus = provider.onStatus((s, err) => {
      setStatus(s);
      setError(err);
    });
    const unsubError = provider.onError((err) => {
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
