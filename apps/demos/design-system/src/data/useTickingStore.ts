import { useEffect, useRef, useState } from 'react';
import { applyTick } from './applyTick';
import { makeRng, seedState } from './seeds';
import type { TerminalState } from './types';

export interface TickingStore {
  state: TerminalState;
  live: boolean;
  setLive: (b: boolean) => void;
  intervalMs: number;
  setIntervalMs: (n: number) => void;
}

export interface UseTickingStoreOptions {
  intervalMs?: number;
  live?: boolean;
}

/**
 * Drives `applyTick` on an interval with a persistent injected RNG. Pauses when
 * `live` is false. Deterministic seed so the initial render is stable.
 */
export function useTickingStore(opts: UseTickingStoreOptions = {}): TickingStore {
  const [state, setState] = useState<TerminalState>(() => seedState(0));
  const [live, setLive] = useState(opts.live ?? true);
  const [intervalMs, setIntervalMs] = useState(opts.intervalMs ?? 1200);
  const rngRef = useRef<() => number>(makeRng(0x5eed1e));

  useEffect(() => {
    if (typeof window === 'undefined' || !live) return;
    const id = window.setInterval(() => {
      setState((s) => applyTick(s, rngRef.current));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [live, intervalMs]);

  return { state, live, setLive, intervalMs, setIntervalMs };
}
