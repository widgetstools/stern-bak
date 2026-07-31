import { createContext, useContext, type ReactNode } from 'react';
import type { StarGridAppState } from './types.js';

const StarGridAppContext = createContext<StarGridAppState | null>(null);

export function StarGridAppProvider({
  value,
  children,
}: {
  value: StarGridAppState;
  children: ReactNode;
}): ReactNode {
  return <StarGridAppContext.Provider value={value}>{children}</StarGridAppContext.Provider>;
}

/** Read the resolved StarGrid app shell. Throws outside `<StarGridApp>`. */
export function useStarGridApp(): StarGridAppState {
  const ctx = useContext(StarGridAppContext);
  if (!ctx) {
    throw new Error(
      '[@wellsfargo-starui/app] useStarGridApp must be used within <StarGridApp>. ' +
        'Wrap your app tree at the entry point.',
    );
  }
  return ctx;
}

/** Convenience — GridHostContext for a specific grid scope. */
export function useStarGridHost(scope: { gridId: string; instanceId?: string }) {
  return useStarGridApp().hostForGrid(scope);
}
