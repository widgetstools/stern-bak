import { applyPatches } from './applyPatches.js';
import type { CellPatch, EditApplyResult, EditJournalEntry, EditSource } from './types.js';
import type { GridDataPort } from '../../../platform/types.js';

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

  /**
   * Erase an entry the timeline should never have held.
   *
   * Distinct from {@link undo}: undo is a user action that writes the old
   * values back and is itself redoable. Retraction is for an edit whose write
   * the server REFUSED — the revert is performed by the write-back path, and
   * what is left to do is remove every trace, because an entry sitting in the
   * undo stack for a value the source never accepted lets the user redo their
   * way back to it.
   *
   * Silently does nothing for an unknown id, so a late failure for an entry
   * already dropped by {@link reset} is not an error.
   */
  retract(entryId: string): boolean {
    const before = this.past.length + this.future.length + this.monitor.length;
    this.past = this.past.filter((entry) => entry.id !== entryId);
    this.future = this.future.filter((entry) => entry.id !== entryId);
    this.monitor = this.monitor.filter((entry) => entry.id !== entryId);
    const removed = before !== this.past.length + this.future.length + this.monitor.length;
    if (removed) this.notify();
    return removed;
  }

  /**
   * The timeline moves only when the grid takes the write.
   *
   * These used to pop the stack and then `await` a transaction whose promise
   * resolved before anything had been written, so a refused undo still moved
   * the cursor — and on a server-side grid, where NOTHING was ever written,
   * the whole stack could be walked without a single value changing. The apply
   * now comes first and the stack move is its consequence.
   */
  async undo(port: GridDataPort): Promise<boolean> {
    const entry = this.past[this.past.length - 1];
    if (!entry) return false;
    const result = await applyPatches(port, entry.patches, 'undo');
    if (!landed(entry, result)) return false;
    this.past.pop();
    this.future.push(entry);
    if (this.future.length > this.limit) {
      this.future = this.future.slice(this.future.length - this.limit);
    }
    this.notify();
    return true;
  }

  async redo(port: GridDataPort): Promise<boolean> {
    const entry = this.future[this.future.length - 1];
    if (!entry) return false;
    const result = await applyPatches(port, entry.patches, 'redo');
    if (!landed(entry, result)) return false;
    this.future.pop();
    this.past.push(entry);
    if (this.past.length > this.limit) {
      this.past = this.past.slice(this.past.length - this.limit);
    }
    this.notify();
    return true;
  }

  /** True when the entry is still on the undo stack (not yet undone). */
  canUndoEntry(entryId: string): boolean {
    return this.past.some((entry) => entry.id === entryId);
  }

  /**
   * Undo this entry and every edit after it — moves the timeline to just
   * before it.
   *
   * Newest first, and it STOPS at the first entry the grid refuses rather than
   * walking past it: the entries are ordered, so continuing would restore an
   * older value over a newer one that is still applied.
   */
  async undoEntry(port: GridDataPort, entryId: string): Promise<boolean> {
    const idx = this.past.findIndex((entry) => entry.id === entryId);
    if (idx < 0) return false;

    const toUndo = this.past.slice(idx);
    const undone: EditJournalEntry[] = [];

    for (let i = toUndo.length - 1; i >= 0; i -= 1) {
      const entry = toUndo[i]!;
      const result = await applyPatches(port, entry.patches, 'undo');
      if (!landed(entry, result)) break;
      undone.push(entry);
    }
    if (undone.length === 0) return false;

    this.past = this.past.slice(0, this.past.length - undone.length);
    // Same order the loop undid them in, so `redo` pops the oldest first.
    for (const entry of undone) this.future.push(entry);
    if (this.future.length > this.limit) {
      this.future = this.future.slice(this.future.length - this.limit);
    }

    this.notify();
    return true;
  }
}

/**
 * Did this entry's undo/redo actually reach the grid?
 *
 * An entry with no patches cannot be recorded (see {@link EditJournal.record})
 * but is treated as trivially applied so a hand-constructed one can never
 * wedge the stack.
 */
function landed(entry: EditJournalEntry, result: EditApplyResult): boolean {
  return entry.patches.length === 0 || result.applied.length > 0;
}
