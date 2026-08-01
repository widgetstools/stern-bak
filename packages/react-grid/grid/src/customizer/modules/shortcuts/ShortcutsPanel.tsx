import { memo, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  Switch,
} from '@wellsfargo-starui/react';
import type { EditorPaneProps, ListPaneProps } from '@wellsfargo-starui/engine';
import {
  defaultShortcut,
  SHORTCUTS_MODULE_ID,
  type ShortcutDefinition,
  type ShortcutOperation,
  type ShortcutsSettings,
  type ShortcutsState,
} from '@wellsfargo-starui/engine';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useModuleState } from '../../hooks/useModuleState';
import { useGridColumns } from '../../hooks/useGridColumns';
import {
  Band,
  CockpitList,
  CockpitListItem,
  CockpitListItemMeta,
  ObjectTitleRow,
  SettingsRow as Row,
  SharpBtn,
  SubLabel,
} from '../../ui/SettingsPanel';
import { BoolControl, NumberControl } from '../general-settings/fieldSchema';

const OPS: { id: ShortcutOperation; label: string }[] = [
  { id: 'multiply', label: '×' },
  { id: 'divide', label: '÷' },
  { id: 'add', label: '+' },
  { id: 'subtract', label: '−' },
];

function ShortcutListBody({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [state, setState] = useModuleState<ShortcutsState>(SHORTCUTS_MODULE_ID);

  const addShortcut = () => {
    const shortcut = defaultShortcut(`Shortcut ${state.shortcuts.length + 1}`);
    setState((prev) => ({ ...prev, shortcuts: [...prev.shortcuts, shortcut] }));
    onSelect(shortcut.id);
  };

  const removeShortcut = (id: string) => {
    setState((prev) => ({ ...prev, shortcuts: prev.shortcuts.filter((s) => s.id !== id) }));
    if (selectedId === id) onSelect(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <Button type="button" variant="outline" size="sm" onClick={addShortcut} data-testid="sc-add-shortcut">
        <Plus className="mr-1 size-3.5" />
        Add shortcut
      </Button>
      <CockpitList data-testid="sc-shortcut-list">
        {state.shortcuts.map((shortcut) => (
          <CockpitListItem
            key={shortcut.id}
            value={shortcut.id}
            active={selectedId === shortcut.id}
            muted={!shortcut.enabled}
            multiline
            onSelect={() => onSelect(shortcut.id)}
            data-testid={`sc-shortcut-item-${shortcut.id}`}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{shortcut.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                aria-label={`Delete ${shortcut.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeShortcut(shortcut.id);
                }}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
            <CockpitListItemMeta>
              {shortcut.enabled ? 'On' : 'Off'}
              {' · '}
              {shortcut.shortcutKey.toUpperCase()}
              {' → '}
              {OPS.find((o) => o.id === shortcut.operation)?.label ?? shortcut.operation}
              {' '}
              {shortcut.shortcutValue}
              {shortcut.scope.columnIds.length > 0
                ? ` · ${shortcut.scope.columnIds.join(', ')}`
                : ' · all numeric cols'}
            </CockpitListItemMeta>
          </CockpitListItem>
        ))}
      </CockpitList>
    </div>
  );
}

function ShortcutEditorBody({ shortcutId }: { shortcutId: string }) {
  const [state, setState] = useModuleState<ShortcutsState>(SHORTCUTS_MODULE_ID);
  const columns = useGridColumns();

  const shortcut = state.shortcuts.find((s) => s.id === shortcutId);

  if (!shortcut) return null;

  const updateShortcut = (patch: Partial<ShortcutDefinition>) => {
    setState((prev) => ({
      ...prev,
      shortcuts: prev.shortcuts.map((s) => (s.id === shortcutId ? { ...s, ...patch } : s)),
    }));
  };

  const columnIdsText = shortcut.scope.columnIds.join(', ');

  return (
    <div className="ds-editor-scroll min-h-0 flex-1 overflow-y-auto p-3">
      <Band index="01" title="SHORTCUT">
        <Row
          label="NAME"
          data-testid="sc-shortcut-name"
          control={(
            <Input
              value={shortcut.name}
              onChange={(e) => updateShortcut({ name: e.target.value })}
              data-testid="sc-shortcut-name-input"
            />
          )}
        />
        <Row
          label="ENABLED"
          data-testid="sc-shortcut-enabled"
          control={(
            <Switch
              checked={shortcut.enabled}
              onCheckedChange={(v) => updateShortcut({ enabled: v })}
              data-testid="sc-shortcut-enabled-toggle"
            />
          )}
        />
        <Row
          label="KEY"
          hint="Single letter — case-insensitive."
          data-testid="sc-shortcut-key"
          control={(
            <Input
              value={shortcut.shortcutKey}
              maxLength={1}
              onChange={(e) => {
                const next = e.target.value.slice(-1);
                if (next === '' || /^[a-zA-Z]$/.test(next)) {
                  updateShortcut({ shortcutKey: next.toLowerCase() });
                }
              }}
              placeholder="H"
              data-testid="sc-shortcut-key-input"
            />
          )}
        />
        <Row
          label="OPERATION"
          data-testid="sc-shortcut-operation"
          control={(
            <div className="flex flex-wrap gap-1">
              {OPS.map((op) => (
                <Button
                  key={op.id}
                  type="button"
                  size="sm"
                  variant={shortcut.operation === op.id ? 'default' : 'outline'}
                  onClick={() => updateShortcut({ operation: op.id })}
                  data-testid={`sc-shortcut-op-${op.id}`}
                >
                  {op.label}
                </Button>
              ))}
            </div>
          )}
        />
        <Row
          label="VALUE"
          data-testid="sc-shortcut-value"
          control={(
            <NumberControl
              testId="sc-shortcut-value-input"
              value={shortcut.shortcutValue}
              onChange={(v) => updateShortcut({ shortcutValue: v })}
            />
          )}
        />
        <Row
          label="COLUMNS"
          hint="Comma-separated colIds/fields — empty = all numeric editable columns."
          data-testid="sc-shortcut-columns"
          control={(
            <Input
              value={columnIdsText}
              onChange={(e) =>
                updateShortcut({
                  scope: {
                    columnIds: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                })}
              placeholder="quantityFace, midPrice"
              data-testid="sc-shortcut-columns-input"
            />
          )}
        />
      </Band>
      <p className="mt-2 text-[11px] text-[color:var(--ds-text-secondary)]">
        Letter shortcuts apply arithmetic with the configured operand. This is separate from Smart Edit
        {' '}
        <strong>K/M/B magnitude parsing</strong>
        {' '}
        while typing in the cell editor.
      </p>
      {columns.length > 0 ? (
        <p className="mt-1 text-[10px] text-[color:var(--ds-text-tertiary)]">
          Available columns:
          {' '}
          {columns.map((c) => c.colId).slice(0, 8).join(', ')}
          {columns.length > 8 ? '…' : ''}
        </p>
      ) : null}
    </div>
  );
}

function ShortcutsSettingsBand() {
  const { draft, setDraft, dirty, save, discard } = useModuleDraft<
    ShortcutsState,
    ShortcutsSettings
  >({
    moduleId: SHORTCUTS_MODULE_ID,
    itemId: 'settings',
    selectItem: (s) => s.settings,
    commitItem: (settings) => (s) => ({ ...s, settings }),
  });

  const updateSetting = <K extends keyof ShortcutsSettings>(
    key: K,
    value: ShortcutsSettings[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <>
      <ObjectTitleRow
        title="Shortcuts"
        actions={(
          <>
            <SharpBtn variant="ghost" onClick={discard} disabled={!dirty}>Reset</SharpBtn>
            <SharpBtn variant="action" onClick={save} disabled={!dirty}>Save</SharpBtn>
          </>
        )}
      />
      <div className="border-b border-[color:var(--ds-border-primary)] p-3">
        <Band index="01" title="GLOBAL">
          <Row
            label="ENABLED"
            data-testid="sc-enabled"
            control={(
              <BoolControl
                testId="sc-enabled-toggle"
                checked={draft.enabled}
                onChange={(v) => updateSetting('enabled', v)}
              />
            )}
          />
          <Row
            label="RECORD HISTORY"
            data-testid="sc-record-history"
            control={(
              <BoolControl
                testId="sc-record-history-toggle"
                checked={draft.recordHistory}
                onChange={(v) => updateSetting('recordHistory', v)}
              />
            )}
          />
        </Band>
        <p className="mt-2 text-[11px] text-[color:var(--ds-text-secondary)]">
          Focus a numeric cell (or select a range in one column) and press a configured letter key.
        </p>
      </div>
    </>
  );
}

export function ShortcutsList({ selectedId, onSelect }: ListPaneProps) {
  const [state] = useModuleState<ShortcutsState>(SHORTCUTS_MODULE_ID);

  useEffect(() => {
    if (!selectedId && state.shortcuts.length > 0) {
      onSelect(state.shortcuts[0].id);
    }
  }, [selectedId, state.shortcuts, onSelect]);

  return <ShortcutListBody selectedId={selectedId} onSelect={onSelect} />;
}

export function ShortcutsEditor({ selectedId }: EditorPaneProps) {
  const ruleExists = selectedId != null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="shortcuts-editor-pane">
      <ShortcutsSettingsBand />
      {ruleExists ? (
        <ShortcutEditorBody shortcutId={selectedId} />
      ) : (
        <p className="p-4 text-xs text-[color:var(--ds-text-secondary)]">
          Add a shortcut to bind a letter key to multiply, divide, add, or subtract a fixed operand.
        </p>
      )}
    </div>
  );
}

function ShortcutsPanelInner() {
  const [state, setState] = useModuleState<ShortcutsState>(SHORTCUTS_MODULE_ID);
  const [selectedId, setSelectedId] = useState<string | null>(state.shortcuts[0]?.id ?? null);

  return (
    <div className="ds-sheet-v2 flex h-full flex-col" data-testid="shortcuts-panel-flat">
      <ShortcutsSettingsBand />
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-[color:var(--ds-border-primary)]">
        <ShortcutListBody selectedId={selectedId} onSelect={setSelectedId} />
        {selectedId ? <ShortcutEditorBody shortcutId={selectedId} /> : null}
      </div>
    </div>
  );
}

export const ShortcutsPanel = memo(ShortcutsPanelInner);
