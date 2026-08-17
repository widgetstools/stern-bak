import {
  buildShortcutPatches,
  type EditApplyResult,
  type EditJournal,
  type EditPlatform,
  type ShortcutDefinition,
} from '@wellsfargo-starui/core';
import { applyAndRecord, cellCountLabel } from '../../../editing/applyAndRecord.js';

export interface ApplyShortcutOptions {
  journal?: EditJournal | null;
  journalLabel?: string;
}

export async function applyShortcutEdit(
  platform: EditPlatform,
  options: {
    cells: Parameters<typeof buildShortcutPatches>[0]['cells'];
    key: string;
    shortcuts: readonly ShortcutDefinition[];
  },
  applyOptions: ApplyShortcutOptions = {},
): Promise<EditApplyResult> {
  const patches = buildShortcutPatches(options);
  return applyAndRecord(platform, patches, applyOptions.journal, {
    source: 'shortcut',
    label: (applied) => {
      if (applyOptions.journalLabel) return applyOptions.journalLabel;
      const shortcut = options.shortcuts.find(
        (s) => s.enabled && s.shortcutKey.toLowerCase() === options.key.toLowerCase(),
      );
      const op = shortcut?.operation ?? 'edit';
      return `Shortcut ${options.key.toUpperCase()} (${op}) · ${cellCountLabel(applied)}`;
    },
  });
}
