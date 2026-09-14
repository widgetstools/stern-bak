/**
 * Registry the active tab's shell publishes into so the right-hand demo
 * rail can drive it — the SSRM twin of the lab's `LabDemoContext`. The
 * handle carries the provider (restart/applyEdits) and a live grid-api
 * accessor instead of the CSRM `rowsRef`, because under SSRM the loaded
 * blocks ARE the only client-side rows.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { GridApi } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';

export interface SsrmStreamHandle {
  tabId: string;
  provider: ISsrmDataProvider;
  getGridApi: () => GridApi | null;
}

interface SsrmDemoContextValue {
  handle: SsrmStreamHandle | null;
  register: (next: SsrmStreamHandle | null) => void;
}

const SsrmDemoContext = createContext<SsrmDemoContextValue | null>(null);

export function SsrmDemoProvider({ children }: { children: ReactNode }) {
  const [handle, setHandle] = useState<SsrmStreamHandle | null>(null);
  const register = useCallback((next: SsrmStreamHandle | null) => {
    setHandle(next);
  }, []);
  const value = useMemo(() => ({ handle, register }), [handle, register]);
  return <SsrmDemoContext.Provider value={value}>{children}</SsrmDemoContext.Provider>;
}

export function useSsrmDemoRegistry() {
  const ctx = useContext(SsrmDemoContext);
  if (!ctx) throw new Error('useSsrmDemoRegistry requires SsrmDemoProvider');
  return ctx;
}
