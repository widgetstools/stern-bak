import { memo } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { ObjectTitleRow, SharpBtn, TitleInput } from '../../../ui/SettingsPanel';

export const RuleEditorHeader = memo(function RuleEditorHeader({
  ruleId,
  name,
  dirty,
  onNameChange,
  onReset,
  onSave,
  testIdPrefix = 'cs-rule',
}: {
  ruleId: string;
  name: string;
  dirty: boolean;
  onNameChange: (next: string) => void;
  onReset: () => void;
  onSave: () => void;
  /** Prefix for `data-testid` hooks (e.g. `alerts-rule` vs `cs-rule`). */
  testIdPrefix?: string;
}) {
  return (
    <div className="ds-editor-header shrink-0 bg-background border-b border-border">
      <ObjectTitleRow
        title={
          <TitleInput
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Rule name"
            data-testid={`${testIdPrefix}-name-${ruleId}`}
          />
        }
        actions={
          <>
            <SharpBtn
              variant="ghost"
              disabled={!dirty}
              onClick={onReset}
              data-testid={`${testIdPrefix}-reset-${ruleId}`}
            >
              <RotateCcw size={13} strokeWidth={2} /> RESET
            </SharpBtn>
            <SharpBtn
              variant={dirty ? 'action' : 'ghost'}
              disabled={!dirty}
              onClick={onSave}
              data-testid={`${testIdPrefix}-save-${ruleId}`}
            >
              <Save size={13} strokeWidth={2} /> SAVE
            </SharpBtn>
          </>
        }
      />
    </div>
  );
});
