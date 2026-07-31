import type { GridApi } from 'ag-grid-community';
import {
  applyForwardPatches,
  buildShortcutPatches,
  type EditJournal,
  type ShortcutDefinition,
} from '@wellsfargo-starui/engine';
import { withJournalApplyGuard } from '../../../editing/journalApplyGuard.js';

export interface ApplyShortcutOptions {
  rowIdField?: string;
  journal?: EditJournal | null;
  journalApplyGridId?: string;
  journalLabel?: string;
}

export async function applyShortcutEdit(
  api: GridApi,
  options: {
    cells: Parameters<typeof buildShortcutPatches>[0]['cells'];
    key: string;
    shortcuts: readonly ShortcutDefinition[];
  },
  applyOptions: ApplyShortcutOptions = {},
): Promise<number> {
  const rowIdField = applyOptions.rowIdField ?? 'id';
  const patches = buildShortcutPatches(options);
  if (patches.length === 0) return 0;

  const apply = () => applyForwardPatches(api as never, patches, rowIdField);
  if (applyOptions.journalApplyGridId) {
    await withJournalApplyGuard(applyOptions.journalApplyGridId, apply);
  } else {
    await apply();
  }

  if (applyOptions.journal) {
    const shortcut = options.shortcuts.find(
      (s) => s.enabled && s.shortcutKey.toLowerCase() === options.key.toLowerCase(),
    );
    const op = shortcut?.operation ?? 'edit';
    applyOptions.journal.record({
      source: 'shortcut',
      label:
        applyOptions.journalLabel
        ?? `Shortcut ${options.key.toUpperCase()} (${op}) · ${patches.length} cell${patches.length === 1 ? '' : 's'}`,
      patches,
    });
  }

  return patches.length;
}
