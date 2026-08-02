/**
 * Orchestrator — composes the modules at both orientations and hosts
 * the shared AlertDialog for the destructive Clear-all action.
 *
 * Two top-level renderers:
 *   - `<FormatterToolbar />`  — horizontal strip, in-grid usage
 *   - `<FormatterPanel />`    — vertical inspector, popped-out usage
 *
 * Both consume `useFormatter()` for state + actions; they differ only
 * in CSS class on the shell + how the modules are sequenced.
 *
 * Pop-out lifecycle (browser window.open / OpenFin) is handled by the
 * `<Poppable />` host above this layer in `FormattingToolbar.tsx`;
 * these components are pure render functions that take props.
 */

import { ModuleClear } from './modules/ModuleClear';
import { ModuleContext } from './modules/ModuleContext';
import { ModuleEditorFilter } from './modules/ModuleEditorFilter';
import { ModuleFormat } from './modules/ModuleFormat';
import { ModuleLibrary } from './modules/ModuleLibrary';
import { ModulePaint } from './modules/ModulePaint';
import { ModuleType } from './modules/ModuleType';
import { ModuleDivider, PanelGroup, TitleBar, ToolbarGroup } from './primitives';
import './formatter.css';
import type { FormatterActions, FormatterState } from './state';

// ─── Horizontal — in-grid toolbar ─────────────────────────────────

export function FormatterToolbar({
  state,
  actions,
  popoutSlot,
}: {
  state: FormatterState;
  actions: FormatterActions;
  /** Optional pop-out trigger button. Hosted here (top-right corner)
   *  so the layout doesn't have to leave room for it inside the row. */
  popoutSlot?: React.ReactNode;
}) {
  return (
    <div
      className="fx-shell fx-shell--horizontal"
      data-testid="formatting-toolbar"
      onMouseDown={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
      }}
    >
      <div className="fx-toolbar-rows">
        {/*
          Excel-ribbon arrangement — a single band of labeled groups,
          controls on top with the group caption centered underneath,
          hairline separators between groups. When the grid is narrow,
          whole groups reflow onto a new line (never split mid-group)
          so the ribbon grows taller, never sideways.
        */}
        <div className="fx-toolbar-row" data-fx-row="ribbon">
          <ToolbarGroup label="Scope" testId="fmt-group-scope">
            <ModuleContext state={state} actions={actions} />
          </ToolbarGroup>
          <ToolbarGroup label="Type" testId="fmt-group-type">
            <ModuleType state={state} actions={actions} />
          </ToolbarGroup>
          <ToolbarGroup label="Paint" testId="fmt-group-paint">
            <ModulePaint state={state} actions={actions} />
          </ToolbarGroup>
          <ToolbarGroup label="Format" testId="fmt-group-format">
            <ModuleFormat state={state} actions={actions} />
          </ToolbarGroup>
          <ToolbarGroup label="Edit" testId="fmt-group-edit">
            <ModuleEditorFilter state={state} actions={actions} />
          </ToolbarGroup>
          <ToolbarGroup label="Templates" testId="fmt-group-templates">
            <ModuleLibrary
              state={state}
              actions={actions}
              orientation="horizontal"
              colLabel={state.colLabel}
            />
          </ToolbarGroup>
          <ToolbarGroup label="Clear" variant="destruct" testId="fmt-group-clear">
            <ModuleClear state={state} actions={actions} orientation="horizontal" />
          </ToolbarGroup>
        </div>
      </div>

      {popoutSlot}
    </div>
  );
}

// ─── Vertical — popped panel ──────────────────────────────────────

export function FormatterPanel({
  state,
  actions,
  frameless,
  onClose,
  titleText,
}: {
  state: FormatterState;
  actions: FormatterActions;
  frameless?: boolean;
  onClose?: () => void;
  titleText?: string;
}) {
  return (
    <div
      className="fx-shell fx-shell--vertical"
      data-testid="formatting-properties-panel"
    >
      {frameless && titleText && onClose && (
        <TitleBar text={titleText} onClose={onClose} testId="fmt-panel-titlebar" />
      )}

      <header data-testid="fmt-panel-header" className="fx-panel-header">
        <PanelGroup label="Scope" testId="fmt-panel-group-scope">
          <ModuleContext state={state} actions={actions} />
        </PanelGroup>
      </header>

      <div className="fx-body" data-testid="fmt-panel-body">
        <div className="fx-panel-sections">
          <PanelGroup label="Type" sectionIndex="02" testId="fmt-panel-group-type">
            <ModuleType state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Paint" sectionIndex="03" testId="fmt-panel-group-paint">
            <ModulePaint state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Format" sectionIndex="04" testId="fmt-panel-group-format">
            <ModuleFormat state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Edit" sectionIndex="05" testId="fmt-panel-group-edit">
            <ModuleEditorFilter state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Templates" sectionIndex="06" testId="fmt-panel-group-templates">
            <ModuleLibrary
              state={state}
              actions={actions}
              orientation="vertical"
              colLabel={state.colLabel}
            />
          </PanelGroup>
        </div>
      </div>

      <footer className="fx-footer">
        <PanelGroup label="Clear" variant="destruct" testId="fmt-panel-group-clear">
          <ModuleClear state={state} actions={actions} orientation="vertical" />
        </PanelGroup>
      </footer>
    </div>
  );
}
