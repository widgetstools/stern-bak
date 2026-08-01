import { memo, useCallback } from 'react';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  type DataChangeHistoryRecordSources,
  type DataChangeHistorySettings,
  type DataChangeHistoryState,
} from '@wellsfargo-starui/core';
import { useGridPlatform } from '../../hooks/GridProvider';
import { journalUndoEntry } from '../../editing/journalUndoRedo';
import { journalCanUndoEntry } from '../../editing/editJournalScope';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useEditJournal, useSyncJournalSuspend } from '../../hooks/useEditJournal';
import { Band, ObjectTitleRow, SettingsRow as Row, SharpBtn } from '../../ui/SettingsPanel';
import { BoolControl, NumberControl } from '../general-settings/fieldSchema';
import { EditHistoryMonitor } from './EditHistoryMonitor';

const SOURCE_LABELS: Record<keyof DataChangeHistoryRecordSources, string> = {
  smartEdit: 'Smart Edit',
  bulkUpdate: 'Bulk Update',
  plusMinus: 'Plus / Minus',
  shortcuts: 'Shortcuts',
  cellEditor: 'Cell editor',
  stream: 'Stream updates',
};

function DataChangeHistoryPanelInner() {
  const platform = useGridPlatform();
  const journal = useEditJournal();
  const { draft, setDraft, dirty, save, discard } = useModuleDraft<
    DataChangeHistoryState,
    DataChangeHistorySettings
  >({
    moduleId: DATA_CHANGE_HISTORY_MODULE_ID,
    itemId: 'settings',
    selectItem: (s) => s.settings,
    commitItem: (settings) => (s) => ({ ...s, settings }),
  });

  useSyncJournalSuspend(draft.suspended);

  const updateSetting = <K extends keyof DataChangeHistorySettings>(
    key: K,
    value: DataChangeHistorySettings[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSource = (key: keyof DataChangeHistoryRecordSources) => {
    setDraft((prev) => ({
      ...prev,
      recordSources: {
        ...prev.recordSources,
        [key]: !prev.recordSources[key],
      },
    }));
  };

  const undoEntry = useCallback(async (entryId: string) => {
    const api = platform.api.api;
    if (!api) return;
    await journalUndoEntry(platform, journal, api as never, entryId);
  }, [journal, platform]);

  return (
    <div className="ds-sheet-v2 flex h-full flex-col" data-testid="edit-history-panel">
      <ObjectTitleRow
        title="Edit History"
        actions={(
          <>
            <SharpBtn variant="ghost" onClick={discard} disabled={!dirty}>Reset</SharpBtn>
            <SharpBtn variant="action" onClick={save} disabled={!dirty}>Save</SharpBtn>
          </>
        )}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="ds-editor-scroll min-h-0 flex-1 overflow-y-auto p-3">
          <Band index="01" title="GLOBAL">
            <Row
              label="ENABLED"
              data-testid="dch-enabled"
              control={(
                <BoolControl
                  testId="dch-enabled-toggle"
                  checked={draft.enabled}
                  onChange={(v) => updateSetting('enabled', v)}
                />
              )}
            />
            <Row
              label="SUSPENDED"
              data-testid="dch-suspended"
              control={(
                <BoolControl
                  testId="dch-suspended-toggle"
                  checked={draft.suspended}
                  onChange={(v) => updateSetting('suspended', v)}
                />
              )}
            />
            <Row
              label="MAX ENTRIES"
              data-testid="dch-max-entries"
              control={(
                <NumberControl
                  testId="dch-max-entries-input"
                  value={draft.maxEntries}
                  min={5}
                  onChange={(v) => updateSetting('maxEntries', v)}
                />
              )}
            />
            <Row
              label="UNIFY UNDO"
              hint="Disable AG Grid built-in cell undo when history is enabled."
              data-testid="dch-unify-undo"
              control={(
                <BoolControl
                  testId="dch-unify-undo-toggle"
                  checked={draft.unifyUndo}
                  onChange={(v) => updateSetting('unifyUndo', v)}
                />
              )}
            />
          </Band>

          <Band index="02" title="RECORD SOURCES">
            {(Object.keys(SOURCE_LABELS) as Array<keyof DataChangeHistoryRecordSources>).map((key) => (
              <Row
                key={key}
                label={SOURCE_LABELS[key].toUpperCase()}
                data-testid={`dch-source-${key}`}
                control={(
                  <BoolControl
                    testId={`dch-source-${key}-toggle`}
                    checked={draft.recordSources[key]}
                    onChange={() => toggleSource(key)}
                  />
                )}
              />
            ))}
          </Band>
        </div>

        <div
          className="flex-shrink-0 border-t border-[color:var(--ds-border-primary)] bg-[var(--ds-surface-ground)]"
          data-testid="dch-monitor-section"
        >
          <Band index="03" title="MONITOR" flush>
            <EditHistoryMonitor
              entries={journal.entries}
              canUndoEntry={(entryId) => journalCanUndoEntry(journal, entryId)}
              onUndo={(entryId) => void undoEntry(entryId)}
            />
          </Band>
        </div>
      </div>
    </div>
  );
}

export const DataChangeHistoryPanel = memo(DataChangeHistoryPanelInner);
