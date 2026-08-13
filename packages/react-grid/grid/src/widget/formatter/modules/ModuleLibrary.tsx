/**
 * 05 · LIBRARY — column templates (apply / save / delete).
 *
 * In horizontal mode renders as a popover-trigger pill + dropdown
 * surface. In vertical mode it expands inline as a list. Both
 * surfaces consume the shared `<TemplateManager />` component for the
 * actual interaction so behaviour is identical.
 */
import { useState } from 'react';
import { ChevronDown, LayoutTemplate } from 'lucide-react';
import { PopoverCompat as Popover, Tooltip } from '../../../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { TemplateManager } from '../../TemplateManager';
import { Module, PillButton, pillClasses, type Orientation } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

export function ModuleLibrary(props: {
  state: FormatterState;
  actions: FormatterActions;
  orientation: Orientation;
  /** Used as the default save-as name when the user leaves the input
   *  empty — `${colLabel} Style`. */
  colLabel: string;
}) {
  if (props.orientation === 'horizontal') {
    return (
      <Module index="05" label="Library">
        <TemplatesControl {...props} />
      </Module>
    );
  }
  return (
    <Module index="05" label="Library">
      <TemplatesInline {...props} />
    </Module>
  );
}

/**
 * Templates popover trigger + manager. `labeled` renders the toolbar's
 * text trigger ("Templates ⌄") instead of the icon-only pill.
 */
export function TemplatesControl({
  state,
  actions,
  colLabel,
  labeled,
}: {
  state: FormatterState;
  actions: FormatterActions;
  colLabel: string;
  labeled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const manager = (
    <TemplateManager
      templates={state.templates}
      activeTemplateId={state.activeTemplateId}
      disabled={state.disabled}
      saveName={state.saveAsTplName}
      saveConfirmed={state.saveAsTplConfirmed}
      onSaveNameChange={actions.setSaveAsTplName}
      onSave={() => {
        const name = state.saveAsTplName.trim() || `${colLabel} Style`;
        const id = actions.saveAsTemplate(name);
        if (id) {
          // Auto-apply the freshly saved template to the active column(s).
          // Without this, the Select closed-state keeps showing "Choose a
          // template…" because `activeTemplateId` is still undefined —
          // the save succeeded but the UI gives the user no visible
          // signal. Applying immediately makes the Select reflect the
          // new template by name and enables the delete button.
          actions.applyTemplate(id);
          actions.setSaveAsTplName('');
          actions.flashSaveAsTpl();
        }
      }}
      onApply={(id) => {
        // Apply to the selected columns AND close the popover so the
        // toolbar gets out of the user's way once their pick has
        // landed. In vertical/panel orientation the popover doesn't
        // exist, but `setOpen(false)` is a harmless no-op there.
        actions.applyTemplate(id);
        setOpen(false);
      }}
      onDelete={actions.deleteTemplate}
      onUpdate={(id) => {
        // Re-snapshot the current column into an existing template.
        // Silently no-ops when the column has nothing template-eligible
        // (the action returns false in that case); we don't surface an
        // error toast because the popover's "Will save: …" hint already
        // tells the user there's nothing to capture.
        actions.updateTemplate(id);
      }}
      onRename={actions.renameTemplate}
      capturableFields={state.capturableFields}
      variant="compact"
      testIdPrefix="tb-tpl"
    />
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Tooltip content="Column templates — apply, save, rename, or delete reusable styling presets">
          <PillButton
            type="button"
            className={pillClasses(labeled ? 'text' : 'icon')}
            aria-label="Templates"
            data-testid="templates-menu-trigger"
            disabled={state.disabled}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <LayoutTemplate size={13} strokeWidth={1.75} />
            {labeled && <span className="fx-trigger-lbl">Templates</span>}
            <ChevronDown size={9} strokeWidth={2} />
          </PillButton>
        </Tooltip>
      }
    >
          <div
            data-testid="templates-menu"
            style={{
              padding: 8,
              minWidth: 240,
              fontFamily: 'var(--fx-font-sans)',
            }}
            onMouseDown={(e) => {
              // The outer guard preserves the active AG-Grid cell by
              // eating mousedown on anything that isn't a form control
              // (otherwise the popover swallows focus and the selected
              // column context is lost). Form controls MUST be exempt,
              // though: native <select> opens its dropdown on mousedown,
              // so preventDefault here kills the dropdown — which is
              // exactly the bug where the template dropdown wouldn't
              // open from the toolbar popover while working fine in the
              // popped-out properties panel.
              const tag = (e.target as HTMLElement).tagName;
              if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'OPTION' && tag !== 'TEXTAREA') {
                e.preventDefault();
              }
            }}
          >
            {manager}
          </div>
    </Popover>
  );
}

/** Vertical panel variant — the manager expands inline as a list. */
function TemplatesInline({
  state,
  actions,
  colLabel,
}: {
  state: FormatterState;
  actions: FormatterActions;
  colLabel: string;
}) {
  return (
    <div style={{ width: '100%', display: 'block' }}>
      <TemplateManager
        templates={state.templates}
        activeTemplateId={state.activeTemplateId}
        disabled={state.disabled}
        saveName={state.saveAsTplName}
        saveConfirmed={state.saveAsTplConfirmed}
        onSaveNameChange={actions.setSaveAsTplName}
        onSave={() => {
          const name = state.saveAsTplName.trim() || `${colLabel} Style`;
          const id = actions.saveAsTemplate(name);
          if (id) {
            actions.applyTemplate(id);
            actions.setSaveAsTplName('');
            actions.flashSaveAsTpl();
          }
        }}
        onApply={(id) => actions.applyTemplate(id)}
        onDelete={actions.deleteTemplate}
        onUpdate={(id) => { actions.updateTemplate(id); }}
        onRename={actions.renameTemplate}
        capturableFields={state.capturableFields}
        variant="panel"
        testIdPrefix="fmt-panel-tpl"
      />
    </div>
  );
}
