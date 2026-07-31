import { createContext, useContext, type ReactNode } from 'react';

/**
 * UI-only chrome state that changes frequently (settings open, save flash,
 * toolbar toggles). Consumers that don't read this context won't re-render
 * when only chrome state moves.
 */
export interface GridChromeState {
  readonly settingsOpen: boolean;
  readonly setSettingsOpen: (open: boolean) => void;
  readonly styleToolbarOpen: boolean;
  readonly editingToolbarOpen: boolean;
  readonly saveFlash: boolean;
  readonly isDirty: boolean;
}

const GridChromeContext = createContext<GridChromeState | null>(null);

export interface GridChromeProviderProps {
  readonly value: GridChromeState;
  readonly children: ReactNode;
}

export function GridChromeProvider({ value, children }: GridChromeProviderProps) {
  return (
    <GridChromeContext.Provider value={value}>
      {children}
    </GridChromeContext.Provider>
  );
}

export function useGridChromeState(): GridChromeState | null {
  return useContext(GridChromeContext);
}
