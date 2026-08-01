import { applyPatches } from './applyPatches.js';
import type { CellPatch, EditGridWriter, EditJournalEntry, EditSource } from './types.js';

export interface EditJournalOptions {
  /** Max undo/redo stack depth. Default 50. */
  limit?: number;
  /** Max entries shown in monitor list. Default 100. */
  monitorLimit?: number;
}

let entryCounter = 0;

function nextEntryId(): string {
  entryCounter += 1;
  return `edit-${Date.now()}-${entryCounter}`;
}

/**
 * Cell-patch journal — one user action = one undo step.
 * Session-only stacks; settings persist via data-change-history module profile.
 */
export class EditJournal {
  private readonly limit: number;
  private readonly monitorLimit: number;
  private past: EditJournalEntry[] = [];
  private future: EditJournalEntry[] = [];
  private monitor: EditJournalEntry[] = [];
  private suspended = false;
  private readonly listeners = new Set<() => void>();

  constructor(options: EditJournalOptions = {}) {
    this.limit = options.limit ?? 50;
    this.monitorLimit = options.monitorLimit ?? 100;
  }

  get entries(): readonly EditJournalEntry[] {
    return this.monitor;
  }

  /** Edits currently applied — size of the undo stack. */
  get undoStackSize(): number {
    return this.past.length;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  /** Subscribe to stack/monitor mutations (record, undo, redo, reset). */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }

  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }

  reset(): void {
    this.past = [];
    this.future = [];
    this.monitor = [];
    this.notify();
  }

  record(params: {
    source: EditSource;
    label: string;
    patches: readonly CellPatch[];
  }): EditJournalEntry | null {
    if (this.suspended || params.patches.length === 0) return null;
    const entry: EditJournalEntry = {
      id: nextEntryId(),
      at: Date.now(),
      source: params.source,
      label: params.label,
      patches: [...params.patches],
    };
    this.past.push(entry);
    if (this.past.length > this.limit) {
      this.past = this.past.slice(this.past.length - this.limit);
    }
    this.future = [];
    this.monitor.unshift(entry);
    if (this.monitor.length > this.monitorLimit) {
      this.monitor = this.monitor.slice(0, this.monitorLimit);
    }
    this.notify();
    return entry;
  }

  async undo(api: EditGridWriter, rowIdField = 'id'): Promise<boolean> {
    const entry = this.past.pop();
    if (!entry) return false;
    this.future.push(entry);
    if (this.future.length > this.limit) {
      this.future = this.future.slice(this.future.length - this.limit);
    }
    await applyPatches(api, entry.patches, 'undo', rowIdField);
    this.notify();
    return true;
  }

  async redo(api: EditGridWriter, rowIdField = 'id'): Promise<boolean> {
    const entry = this.future.pop();
    if (!entry) return false;
    this.past.push(entry);
    if (this.past.length > this.limit) {
      this.past = this.past.slice(this.past.length - this.limit);
    }
    await applyPatches(api, entry.patches, 'redo', rowIdField);
    this.notify();
    return true;
  }

  /** True when the entry is still on the undo stack (not yet undone). */
  canUndoEntry(entryId: string): boolean {
    return this.past.some((entry) => entry.id === entryId);
  }

  /** Undo this entry and every edit after it — moves the timeline to just before it. */
  async undoEntry(api: EditGridWriter, entryId: string, rowIdField = 'id'): Promise<boolean> {
    const idx = this.past.findIndex((entry) => entry.id === entryId);
    if (idx < 0) return false;

    const toUndo = this.past.slice(idx);
    this.past = this.past.slice(0, idx);

    for (let i = toUndo.length - 1; i >= 0; i -= 1) {
      await applyPatches(api, toUndo[i]!.patches, 'undo', rowIdField);
    }

    for (let i = toUndo.length - 1; i >= 0; i -= 1) {
      this.future.push(toUndo[i]!);
    }
    if (this.future.length > this.limit) {
      this.future = this.future.slice(this.future.length - this.limit);
    }

    this.notify();
    return true;
  }
}
