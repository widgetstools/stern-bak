import type { LabRow } from '../data/types';

export interface LabStreamOptions {
  rowCount?: number;
  updateIntervalMs?: number;
  enableUpdates?: boolean;
}

export interface LabScenario {
  id: string;
  title: string;
  description: string;
  /** Accent for card chrome — design-system semantic hues only */
  accent: 'positive' | 'negative' | 'warning' | 'info' | 'neutral';
  /** Which lab tab(s) this scenario is meant for */
  tabs: string[];
  apply: (rows: readonly LabRow[]) => LabRow[];
}

export interface LabStreamHandle {
  tabId: string;
  getRowCount: () => number;
  /** Rows after the last full provider snapshot (stable between ticks). */
  snapshotRowCount: number;
  paused: boolean;
  setPaused: (v: boolean) => void;
  tickMs: number;
  setTickMs: (ms: number) => void;
  activeScenarioId: string | null;
  applyScenario: (id: string) => void;
  clearScenario: () => void;
}
