import { type DockManagerState, serialize, deserialize } from '@widgetstools/dock-manager-core';

const PREFIX = 'ds-dock-';

export function saveLayout(tab: string, state: DockManagerState): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(PREFIX + tab, serialize(state)); } catch { /* ignore quota */ }
}

export function loadLayout(tab: string): DockManagerState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + tab);
    if (!raw) return null;
    return deserialize(JSON.parse(raw)).state;
  } catch { return null; }
}

export function resetLayout(tab: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(PREFIX + tab); } catch { /* ignore */ }
}
