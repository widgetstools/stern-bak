import { useCallback } from 'react';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  type DataChangeHistoryState,
} from '@wellsfargo-starui/core';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wellsfargo-starui/react';
import { Redo2, Undo2 } from 'lucide-react';
import type { EditingToolbarSegmentProps } from '../../editing/editingToolbarLayout';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useEditJournal } from '../../hooks/useEditJournal';
import { journalUndoStackSize } from '../../editing/editJournalScope';
import { journalUndo, journalRedo } from '../../editing/journalUndoRedo';
import { useModuleState } from '../../hooks/useModuleState';
import {
  EditingToolbarIconButton,
  EditingToolbarOpGroup,
  EditingToolbarSegment,
} from '../../../widget/editingToolbar/EditingToolbarPrimitives';

export function EditHistoryToolbarBody({ layout = 'standalone' }: EditingToolbarSegmentProps) {
  const platform = useGridPlatform();
  const journal = useEditJournal();
  const [history] = useModuleState<DataChangeHistoryState>(DATA_CHANGE_HISTORY_MODULE_ID);

  const handleUndo = useCallback(async () => {
    const api = platform.api.api;
    if (!api) return;
    await journalUndo(platform, journal, api as never);
  }, [journal, platform]);

  const handleRedo = useCallback(async () => {
    const api = platform.api.api;
    if (!api) return;
    await journalRedo(platform, journal, api as never);
  }, [journal, platform]);

  const entryCount = journalUndoStackSize(journal);

  if (!history.settings.enabled) return null;

  return (
    <EditingToolbarSegment
      layout={layout}
      label="History"
      data-testid="edit-history-toolbar"
      meta={
        <span data-testid="edit-history-count">
          {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
        </span>
      }
    >
      <EditingToolbarOpGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <EditingToolbarIconButton
              data-testid="edit-history-undo"
              disabled={!journal.canUndo}
              onClick={() => void handleUndo()}
              aria-label="Undo last edit"
              title="Undo last edit"
            >
              <Undo2 size={14} strokeWidth={2} aria-hidden />
            </EditingToolbarIconButton>
          </TooltipTrigger>
          <TooltipContent>Undo last edit</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <EditingToolbarIconButton
              data-testid="edit-history-redo"
              disabled={!journal.canRedo}
              onClick={() => void handleRedo()}
              aria-label="Redo"
              title="Redo"
            >
              <Redo2 size={14} strokeWidth={2} aria-hidden />
            </EditingToolbarIconButton>
          </TooltipTrigger>
          <TooltipContent>Redo</TooltipContent>
        </Tooltip>
      </EditingToolbarOpGroup>
    </EditingToolbarSegment>
  );
}
