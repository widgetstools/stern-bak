import { createContext, useContext, type ReactNode } from 'react';
import type { GridPlatform } from '@wellsfargo-starui/engine';

const Ctx = createContext<GridPlatform | null>(null);

export function GridProvider({
  platform,
  children,
}: {
  platform: GridPlatform;
  children: ReactNode;
}) {
  return <Ctx.Provider value={platform}>{children}</Ctx.Provider>;
}

/** Access the active `GridPlatform`. Panels + hooks go through this. */
export function useGridPlatform(): GridPlatform {
  const p = useContext(Ctx);
  if (!p) throw new Error('useGridPlatform() must be used inside <GridProvider>');
  return p;
}

/**
 * Variant that returns `null` instead of throwing when no provider is present.
 * Use for optional widgets that may render outside the grid (e.g. toolbar
 * decorations rendered by host shells before the grid mounts).
 */
export function useOptionalGridPlatform(): GridPlatform | null {
  return useContext(Ctx);
}
