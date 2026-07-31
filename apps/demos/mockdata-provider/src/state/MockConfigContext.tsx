import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { MockProviderConfig } from '@wellsfargo-starui/types';

const DEFAULT_CFG: MockProviderConfig = {
  providerType: 'mock',
  dataType: 'positions',
  rowCount: 200,
  updateIntervalMs: 750,
  enableUpdates: true,
};

interface Ctx {
  cfg: MockProviderConfig;
  setDataType: (dt: 'positions' | 'trades' | 'orders') => void;
  setRowCount: (n: number) => void;
  setUpdateIntervalMs: (ms: number) => void;
  setEnableUpdates: (on: boolean) => void;
  reset: () => void;
}

const MockConfigCtx = createContext<Ctx | null>(null);

export function MockConfigProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<MockProviderConfig>(DEFAULT_CFG);

  const setDataType = useCallback(
    (dataType: 'positions' | 'trades' | 'orders') =>
      setCfg((c) => (c.dataType === dataType ? c : { ...c, dataType })),
    [],
  );
  const setRowCount = useCallback(
    (rowCount: number) =>
      setCfg((c) => (c.rowCount === rowCount ? c : { ...c, rowCount })),
    [],
  );
  const setUpdateIntervalMs = useCallback(
    (updateIntervalMs: number) =>
      setCfg((c) =>
        c.updateIntervalMs === updateIntervalMs ? c : { ...c, updateIntervalMs },
      ),
    [],
  );
  const setEnableUpdates = useCallback(
    (enableUpdates: boolean) =>
      setCfg((c) =>
        c.enableUpdates === enableUpdates ? c : { ...c, enableUpdates },
      ),
    [],
  );
  const reset = useCallback(() => setCfg(DEFAULT_CFG), []);

  const value = useMemo<Ctx>(
    () => ({ cfg, setDataType, setRowCount, setUpdateIntervalMs, setEnableUpdates, reset }),
    [cfg, setDataType, setRowCount, setUpdateIntervalMs, setEnableUpdates, reset],
  );

  return <MockConfigCtx.Provider value={value}>{children}</MockConfigCtx.Provider>;
}

export function useMockConfig(): Ctx {
  const ctx = useContext(MockConfigCtx);
  if (!ctx) throw new Error('useMockConfig must be used inside <MockConfigProvider>');
  return ctx;
}
