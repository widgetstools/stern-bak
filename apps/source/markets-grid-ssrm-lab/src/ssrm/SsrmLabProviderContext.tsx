import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { TransportConfig } from '@wellsfargo-starui/types';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/react/data/runtime';
import {
  MOCK_SSRM_CFG_VERSION,
  MOCK_SSRM_PROVIDER_ID,
  mockSsrmProviderDraft,
  SSRM_CFG_VERSION_KEY,
} from '../mockSsrmProvider.js';

export interface SsrmLabProviderValue {
  providerId: string;
  inlineCfg: TransportConfig;
  seeding: boolean;
}

const SsrmLabProviderContext = createContext<SsrmLabProviderValue | null>(null);

/** Seeds the `mock-ssrm` catalog row once and exposes it to feature tabs. */
export function SsrmLabProvider({ children }: { children: ReactNode }) {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId, { subtype: 'mock-ssrm' });
      const exists = rows.some((p) => p.providerId === MOCK_SSRM_PROVIDER_ID);
      const storedVersion = localStorage.getItem(SSRM_CFG_VERSION_KEY);
      const shouldRefresh = storedVersion !== String(MOCK_SSRM_CFG_VERSION);
      if (shouldRefresh || !exists) {
        await configStore.save(mockSsrmProviderDraft, userId);
      }
      if (shouldRefresh) {
        localStorage.setItem(SSRM_CFG_VERSION_KEY, String(MOCK_SSRM_CFG_VERSION));
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  const value = useMemo<SsrmLabProviderValue>(
    () => ({
      providerId: MOCK_SSRM_PROVIDER_ID,
      inlineCfg: mockSsrmProviderDraft.config as TransportConfig,
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
