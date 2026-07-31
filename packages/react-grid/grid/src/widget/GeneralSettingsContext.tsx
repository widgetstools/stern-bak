import { createContext, useContext, type ReactNode } from 'react';
import type { GeneralSettingsState } from '@wellsfargo-starui/engine';

const GeneralSettingsContext = createContext<GeneralSettingsState | undefined>(undefined);

export interface GeneralSettingsProviderProps {
  readonly value: GeneralSettingsState | undefined;
  readonly children: ReactNode;
}

/** Single subscription point for general-settings reads in the chrome tree. */
export function GeneralSettingsProvider({ value, children }: GeneralSettingsProviderProps) {
  return (
    <GeneralSettingsContext.Provider value={value}>
      {children}
    </GeneralSettingsContext.Provider>
  );
}

/** Read general-settings from the nearest provider (no store subscription). */
export function useGeneralSettingsFromContext(): GeneralSettingsState | undefined {
  return useContext(GeneralSettingsContext);
}
