import { RotateCcw, Save } from 'lucide-react';
import {
  ObjectTitleRow,
  SharpBtn,
  TitleInput,
} from '../../../ui/SettingsPanel';

export function ColumnEditorHeader({
  colId,
  headerName,
  hostHeaderName,
  dirty,
  onHeaderNameChange,
  onSave,
  onDiscard,
}: {
  colId: string;
  headerName: string | undefined;
  hostHeaderName: string;
  dirty: boolean;
  onHeaderNameChange: (next: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="shrink-0 bg-background border-b border-border">
      <ObjectTitleRow
        title={
          <TitleInput
            value={headerName ?? hostHeaderName}
            onChange={(e) => onHeaderNameChange(e.target.value)}
            placeholder={hostHeaderName}
            data-testid={`cols-header-name-${colId}`}
          />
        }
        actions={
          <>
            <SharpBtn
              variant="ghost"
              disabled={!dirty}
              onClick={onDiscard}
              data-testid={`cols-discard-${colId}`}
              title="Revert unsaved changes"
            >
              <RotateCcw size={13} strokeWidth={2} /> RESET
            </SharpBtn>
            <SharpBtn
              variant={dirty ? 'action' : 'ghost'}
              disabled={!dirty}
              onClick={onSave}
              data-testid={`cols-save-${colId}`}
              title="Save column settings"
            >
              <Save size={13} strokeWidth={2} /> SAVE
            </SharpBtn>
          </>
        }
      />
    </div>
  );
}
