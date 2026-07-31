export interface DemoEventLogEntry {
  id: string;
  at: string;
  handlerId: string;
  summary: string;
  payload?: unknown;
}

const MAX_ENTRIES = 120;
let entries: DemoEventLogEntry[] = [];
const listeners = new Set<() => void>();

export function appendDemoEventLog(
  entry: Omit<DemoEventLogEntry, 'id' | 'at'>,
): DemoEventLogEntry {
  const row: DemoEventLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  };
  entries = [row, ...entries].slice(0, MAX_ENTRIES);
  for (const fn of listeners) fn();
  return row;
}

export function subscribeDemoEventLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDemoEventLog(): readonly DemoEventLogEntry[] {
  return entries;
}

export function clearDemoEventLog(): void {
  entries = [];
  for (const fn of listeners) fn();
}
