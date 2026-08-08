import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SsrmProviderClientAdapter,
  type ISsrmDataProvider,
} from '@wellsfargo-starui/data';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';
import { useDataServicesContext } from './DataServicesProvider.js';

export interface UseSsrmDataProviderOpts {
  inlineCfg?: ProviderConfig;
  autoStart?: boolean;
  trackStatus?: boolean;
}

export interface UseSsrmDataProviderResult {
  provider: ISsrmDataProvider | null;
  status: ProviderStatus;
  error?: string;
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  restart: (extra?: Record<string, unknown>) => Promise<void>;
}

/** Hub-backed {@link ISsrmDataProvider} for `stomp-ssrm` MarketsGrid. */
export function useSsrmDataProvider(
  providerId: string | null | undefined,
  opts: UseSsrmDataProviderOpts = {},
): UseSsrmDataProviderResult {
  const { client } = useDataServicesContext();
  const { inlineCfg, autoStart = true, trackStatus = true } = opts;

  const [status, setStatus] = useState<ProviderStatus>('loading');
  const [error, setError] = useState<string | undefined>(undefined);

  const provider = useMemo(() => {
    if (!providerId) return null;
    return new SsrmProviderClientAdapter({ client, providerId, inlineCfg });
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
    // When `autoStart` is false, an outer wiring hook owns start/stop —
    // only stop here when this hook is also responsible for lifecycle.
    const ownLifecycle = autoStart;
    if (!trackStatus) {
      return () => {
        if (ownLifecycle) void provider.stop();
      };
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
      if (ownLifecycle) void provider.stop();
    };
  }, [provider, trackStatus, autoStart]);

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
        await provider.start();
      } catch {
        if (!cancelled) {
          /* status mirrored via onError */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoStart, provider]);

  const refresh = useCallback(async () => {
    await providerRef.current?.refresh();
  }, []);

  const restart = useCallback(async (extra?: Record<string, unknown>) => {
    await providerRef.current?.restart(extra);
  }, []);

  return { provider, status, error, start, refresh, restart };
}
