/**
 * Per-turn undo, held in the panel.
 *
 * `beginTurn` starts recording, `noteToolCall` snapshots the affected grid the
 * first time a turn mutates anything (so read-only turns cost nothing), and
 * `undoLast` writes the snapshot back. See `undo.ts` for what a profile
 * snapshot can and can't reverse.
 */
import { useCallback, useRef, useState } from 'react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  captureGrid,
  restore,
  pushEntry,
  describeUndo,
  isMutatingTool,
  IRREVERSIBLE_TOOLS,
  type ProfileBackup,
  type UndoEntry,
} from './undo';
import type { ToolExecutionResult } from './toolResult';

export interface UndoStack {
  /** Label shown on the Undo affordance, or null when there's nothing to undo. */
  lastLabel: string | null;
  beginTurn: (label: string) => void;
  noteToolCall: (name: string, args: Record<string, unknown>) => Promise<void>;
  /** Marks the turn as having produced changes worth summarising. */
  endTurn: () => void;
  undoLast: () => Promise<ToolExecutionResult>;
}

export function useUndoStack(configManager: ConfigManager | undefined): UndoStack {
  const stackRef = useRef<UndoEntry[]>([]);
  const [lastLabel, setLastLabel] = useState<string | null>(null);

  const turnRef = useRef<{ label: string; backups: ProfileBackup[]; captured: Set<string>; irreversible: string[] } | null>(null);

  const beginTurn = useCallback((label: string) => {
    turnRef.current = { label, backups: [], captured: new Set(), irreversible: [] };
  }, []);

  const noteToolCall = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const turn = turnRef.current;
      if (!turn || !configManager || !isMutatingTool(name)) return;
      if (IRREVERSIBLE_TOOLS.has(name)) turn.irreversible.push(name);

      const gridId = typeof args.targetGridId === 'string' ? args.targetGridId : undefined;
      // Snapshot each grid once per turn — before the first change to it, so a
      // multi-call turn still reverses to where it started.
      if (!gridId || turn.captured.has(gridId)) return;
      turn.captured.add(gridId);
      try {
        turn.backups.push(...(await captureGrid(configManager, gridId)));
      } catch (err) {
        console.warn('[aiAssistant] undo snapshot failed — that turn will not be undoable:', err);
      }
    },
    [configManager],
  );

  const endTurn = useCallback(() => {
    const turn = turnRef.current;
    turnRef.current = null;
    if (!turn || turn.backups.length === 0) return;
    stackRef.current = pushEntry(stackRef.current, {
      label: turn.label,
      backups: turn.backups,
      irreversible: turn.irreversible,
      at: Date.now(),
    });
    setLastLabel(turn.label);
  }, []);

  const undoLast = useCallback(async (): Promise<ToolExecutionResult> => {
    const entry = stackRef.current.at(-1);
    if (!entry || !configManager) {
      return { ok: false, summary: 'There is nothing to undo in this conversation yet.' };
    }
    try {
      await restore(configManager, entry.backups);
    } catch (err) {
      return { ok: false, summary: `Undo failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    stackRef.current = stackRef.current.slice(0, -1);
    setLastLabel(stackRef.current.at(-1)?.label ?? null);
    return { ok: true, summary: describeUndo(entry) };
  }, [configManager]);

  return { lastLabel, beginTurn, noteToolCall, endTurn, undoLast };
}
