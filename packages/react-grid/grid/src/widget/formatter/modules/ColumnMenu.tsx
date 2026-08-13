/**
 * Column menu — toolbar dropdown batching the per-column configuration
 * controls (cell editor, filter, floating filter, editable lock) behind
 * one labeled trigger so the single-row toolbar stays compact.
 *
 * Pure arrangement: the controls are the same {@link EditorFilterCluster}
 * and {@link EditableToggle} the vertical panel renders inline, so
 * behaviour cannot drift between surfaces.
 */
import { useState } from 'react';
import { ChevronDown, Columns3 } from 'lucide-react';
import { PopoverCompat as Popover, Tooltip } from '../../../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { PillButton, pillClasses } from '../primitives';
import { EditableToggle } from './ModuleContext';
import { EditorFilterCluster } from './ModuleEditorFilter';
import type { FormatterActions, FormatterState } from '../state';

export function ColumnMenuControl({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Tooltip content="Column settings — cell editor, filter, floating filter, editing lock">
          <PillButton
            type="button"
            className={pillClasses('text')}
            aria-label="Column settings"
            data-testid="fmt-column-menu-trigger"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <Columns3 size={13} strokeWidth={1.75} />
            <span className="fx-trigger-lbl">Column</span>
            <ChevronDown size={9} strokeWidth={2} />
          </PillButton>
        </Tooltip>
      }
    >
      <div
        className="fx-menu-panel"
        data-testid="fmt-column-menu"
        onMouseDown={(e) => {
          // Preserve the active AG-Grid cell: eat mousedown on anything
          // that isn't a form control (same guard as the templates menu).
          const tag = (e.target as HTMLElement).tagName;
          if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'OPTION' && tag !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
      >
        <section className="fx-menu-panel__section">
          <h4 className="fx-menu-panel__label">Editor &amp; filter</h4>
          <div className="fx-menu-panel__row">
            <EditorFilterCluster state={state} actions={actions} />
          </div>
        </section>
        <section className="fx-menu-panel__section">
          <h4 className="fx-menu-panel__label">Behavior</h4>
          <div className="fx-menu-panel__row">
            <EditableToggle state={state} actions={actions} />
            <span className="fx-menu-panel__hint">
              {state.cellsEditable ? 'Cells editable' : 'Cells locked'}
            </span>
          </div>
        </section>
      </div>
    </Popover>
  );
}
