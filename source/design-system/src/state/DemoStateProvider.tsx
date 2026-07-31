import React, { createContext, useContext, useState } from 'react';
import type { TickingStore } from '../data/useTickingStore';
import { useTickingStore } from '../data/useTickingStore';

export interface DemoState {
  store: TickingStore;
  selectedId: string;
  setSelectedId: (id: string) => void;
  clickedPrice: number | null;
  setClickedPrice: (price: number | null) => void;
  selectedOrderId: string | null;
  setSelectedOrderId: (id: string | null) => void;
}

const DemoContext = createContext<DemoState | null>(null);

export function DemoStateProvider({ children }: { children: React.ReactNode }) {
  const store = useTickingStore();
  const firstId = store.state.instruments[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState<string>(firstId);
  const [clickedPrice, setClickedPrice] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(store.state.orders[0]?.id ?? null);

  return (
    <DemoContext.Provider value={{ store, selectedId, setSelectedId, clickedPrice, setClickedPrice, selectedOrderId, setSelectedOrderId }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemoState(): DemoState {
  const ctx = useContext(DemoContext);
  if (ctx === null) {
    throw new Error('useDemoState must be used within a DemoStateProvider');
  }
  return ctx;
}
