import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/react/data/runtime';
import {
  SSRM_CFG_VERSION_KEY,
  STOMP_SSRM_CFG_VERSION,
  STOMP_SSRM_PROVIDER_ID,
  stompSsrmProviderDraft,
} from '../stompSsrmProvider.js';

export interface SsrmLabProviderValue {
  providerId: string;
  inlineCfg: ProviderConfig;
  seeding: boolean;
}

const SsrmLabProviderContext = createContext<SsrmLabProviderValue | null>(null);

/** Seeds the `stomp-ssrm` catalog row once and exposes it to feature tabs. */
export function SsrmLabProvider({ children }: { children: ReactNode }) {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId, { subtype: 'stomp-ssrm' });
      const exists = rows.some((p) => p.providerId === STOMP_SSRM_PROVIDER_ID);
      const storedVersion = localStorage.getItem(SSRM_CFG_VERSION_KEY);
      const shouldRefresh = storedVersion !== String(STOMP_SSRM_CFG_VERSION);
      if (shouldRefresh || !exists) {
        await configStore.save(stompSsrmProviderDraft, userId);
      }
      if (shouldRefresh) {
        localStorage.setItem(SSRM_CFG_VERSION_KEY, String(STOMP_SSRM_CFG_VERSION));
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  const value = useMemo<SsrmLabProviderValue>(
    () => ({
      providerId: STOMP_SSRM_PROVIDER_ID,
      inlineCfg: stompSsrmProviderDraft.config as ProviderConfig,
      seeding: !ready,
    }),
    [ready],
  );

  return (
    <SsrmLabProviderContext.Provider value={value}>{children}</SsrmLabProviderContext.Provider>
  );
}

export function useSsrmLabProvider(): SsrmLabProviderValue {
  const ctx = useContext(SsrmLabProviderContext);
  if (!ctx) throw new Error('useSsrmLabProvider requires SsrmLabProvider');
  return ctx;
}
