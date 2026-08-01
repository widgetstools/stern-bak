import React, { createContext, useContext, useMemo } from 'react';
import type { IBlotterDataProvider, IActionRegistry } from './interfaces.js';

export interface BlotterDependencies {
  dataProvider?: IBlotterDataProvider;
  actionRegistry?: IActionRegistry;
}

const BlotterDIContext = createContext<BlotterDependencies>({});

export function useBlotterDI(): BlotterDependencies {
  return useContext(BlotterDIContext);
}

export interface BlotterProviderProps {
  children: React.ReactNode;
  dataProvider?: IBlotterDataProvider;
  actionRegistry?: IActionRegistry;
}

/**
 * BlotterProvider — injects data provider and action registry into the widget tree.
 * The reference app provides concrete implementations (STOMP, mock, etc.).
 */
export function BlotterProvider({
  children,
  dataProvider,
  actionRegistry
}: BlotterProviderProps) {
  const value = useMemo(() => ({
    dataProvider,
    actionRegistry
  }), [dataProvider, actionRegistry]);

  return (
    <BlotterDIContext.Provider value={value}>
      {children}
    </BlotterDIContext.Provider>
  );
}
