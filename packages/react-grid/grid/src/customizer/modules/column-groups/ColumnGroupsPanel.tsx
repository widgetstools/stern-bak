/**
 * Column Groups settings panel — v4 rewrite.
 *
 * Like `CalculatedColumnsPanel`, this file carried three v2-era
 * antipatterns that the v3 audit flagged:
 *
 *  1. Local `dirtyRegistry = new Set<string>()` +
 *     `window.dispatchEvent('gc-dirty-change')` for LED broadcast.
 *     Replaced by `useDirty(key)` against the per-platform DirtyBus —
 *     `useModuleDraft` auto-registers `column-groups:<groupId>`.
 *  2. A second local `useGridColumns()` hook (same name as the platform
 *     hook, different implementation) with `setTick` polling on
 *     `displayedColumnsChanged`. Replaced by the platform hook.
 *  3. `useDraftModuleItem({ store, … })` + `useModuleState(store, id)`
 *     compat shims — now `useModuleDraft` + 1-arg `useModuleState(id)`.
 *
 * Tree-mutation helpers (update / delete / move / flatten) moved to
 * `treeOps.ts` — pure data transforms deserve their own testable module.
 *
 * All `cg-*` testIds preserved character-for-character.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FolderPlus,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X as XIcon,
} from 'lucide-react';
import { Switch } from '@wellsfargo-starui/react';
import { Select } from '../../ui/NativeOptionsSelect';
import { Tooltip } from '../../ui/HoverTooltip';
import type { EditorPaneProps, ListPaneProps } from '@wellsfargo-starui/core';
import { useModuleState } from '../../hooks/useModuleState';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useDirty } from '../../hooks/useDirty';
import { useGridColumns, type GridColumnInfo } from '../../hooks/useGridColumns';
import {
  Band,
  Caps,
  CockpitList,
  CockpitListItem,
  LedBar,
  Mono,
  ObjectTitleRow,
  SharpBtn,
  SummaryChip,
  TitleInput,
} from '../../ui/SettingsPanel';
import { ChromeButton } from '../../ui/ChromeButton';
import { StyleEditor, type StyleEditorValue } from '../../ui/StyleEditor';
import type {
  ColumnGroupNode,
  ColumnGroupsState,
  GroupChildShow,
  GroupHeaderStyle,
} from './state';
import { collectAssignedColIds } from './composeGroups';
import {
  deleteGroupAtPath,
  flattenGroups,
  moveGroupAtPath,
  updateGroupAtPath,
  type Path,
} from './treeOps';

const MODULE_ID = 'column-groups';

// ─── Visibility cycle helpers ─────────────────────────────────────────

const SHOW_ORDER: GroupChildShow[] = ['always', 'open', 'closed'];

function nextShowMode(current: GroupChildShow | undefined): GroupChildShow {
  const cur = current ?? 'always';
  const idx = SHOW_ORDER.indexOf(cur);
  return SHOW_ORDER[(idx + 1) % SHOW_ORDER.length];
}

function showIcon(show: GroupChildShow | undefined, size = 11) {
  const mode = show ?? 'always';
  if (mode === 'open') return <EyeOff size={size} strokeWidth={1.75} />;
  if (mode === 'closed') return <Lock size={size} strokeWidth={1.75} />;
  return <Eye size={size} strokeWidth={1.75} />;
}

function showTooltip(show: GroupChildShow | undefined): string {
  const mode = show ?? 'always';
  if (mode === 'open') return 'Visible only when group is expanded';
  if (mode === 'closed') return 'Visible only when group is collapsed';
  return 'Always visible';
}

function showAccentColor(show: GroupChildShow | undefined): string {
  const mode = show ?? 'always';
  if (mode === 'open') return 'var(--ds-accent-positive)';
  if (mode === 'closed') return 'var(--ds-accent-warning)';
  return 'var(--ds-text-muted)';
}

// ─── headerStyle ↔ StyleEditorValue ────────────────────────────────────

function headerStyleToEditor(style: GroupHeaderStyle | undefined): StyleEditorValue {
  if (!style) return {};
  return {
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    align: style.align,
    fontSize: style.fontSize,
    color: style.color,
    backgroundColor: style.background,
    backgroundAlpha: 100,
    // Same `BorderSpec` triplet shape as StyleEditorValue.borders.
    borders: style.borders,
  };
}

function headerStyleFromEditor(
  previous: GroupHeaderStyle | undefined,
  value: StyleEditorValue,
): GroupHeaderStyle | undefined {
  const next: GroupHeaderStyle = {
    ...(previous ?? {}),
    bold: value.bold,
    italic: value.italic,
    underline: value.underline,
    align:
      value.align === 'left' || value.align === 'center' || value.align === 'right'
        ? value.align
        : undefined,
    fontSize: value.fontSize,
    color: value.color,
    background: value.backgroundColor,
    borders: value.borders,
  };
  for (const k of Object.keys(next) as Array<keyof GroupHeaderStyle>) {
    if (next[k] === undefined || next[k] === false) delete next[k];
  }
  // Drop an empty borders map so persisted state stays lean.
  if (next.borders && Object.values(next.borders).every((v) => v === undefined)) {
    delete next.borders;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

// ─── ID generator ──────────────────────────────────────────────────────

function generateGroupId(): string {
  return `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Dirty LED for the list rail ───────────────────────────────────────

function DirtyListLed({ groupId }: { groupId: string }) {
  const { isDirty } = useDirty(`${MODULE_ID}:${groupId}`);
  if (!isDirty) return null;
  return <LedBar amber on title="Unsaved changes" />;
}

// ─── List pane ─────────────────────────────────────────────────────────

export function ColumnGroupsList({ selectedId, onSelect }: ListPaneProps) {
  const [state, setState] = useModuleState<ColumnGroupsState>(MODULE_ID);
  const flat = useMemo(() => flattenGroups(state.groups), [state.groups]);

  const addTopLevelGroup = useCallback(() => {
    const newGroupId = generateGroupId();
    setState((prev) => ({
      ...prev,
      groups: [
        ...prev.groups,
        {
          groupId: newGroupId,
          headerName: 'New Group',
          children: [],
          openByDefault: true,
        },
      ],
    }));
    onSelect(newGroupId);
  }, [setState, onSelect]);

  const deleteGroup = useCallback((groupId: string, path: Path) => {
    const deleteIndex = flat.findIndex((entry) => entry.node.groupId === groupId);
    if (deleteIndex === -1) return;

    const nextSelection = selectedId === groupId
      ? flat[deleteIndex + 1]?.node.groupId ?? flat[deleteIndex - 1]?.node.groupId ?? null
      : selectedId;

    setState((prev) => ({ ...prev, groups: deleteGroupAtPath(prev.groups, path) }));
    onSelect(nextSelection);
  }, [flat, selectedId, setState, onSelect]);

  useEffect(() => {
    if (!selectedId && flat.length > 0) onSelect(flat[0].node.groupId);
  }, [selectedId, flat, onSelect]);

  return (
    <>
      <div className="flex items-center gap-2.5 sticky top-0 bg-background border-b border-border px-4 pt-3.5 pb-2.5">
        <Caps>Groups</Caps>
        <Mono color="var(--ds-text-faint)">
          {String(flat.length).padStart(2, '0')}
        </Mono>
        <span className="flex-1" />
        <ChromeButton
          type="button"
          onClick={addTopLevelGroup}
          title="Add group"
          data-testid="cg-add-group-btn"
          className="w-[22px] h-[22px] inline-flex items-center justify-center bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] border border-[var(--ds-primary-ring)] rounded-sm cursor-pointer p-0"
        >
          <Plus size={11} strokeWidth={2.5} />
        </ChromeButton>
      </div>
      <CockpitList>
        {flat.map((fg) => {
          const active = fg.node.groupId === selectedId;
          return (
            <CockpitListItem
              key={fg.node.groupId}
              value={fg.node.groupId}
              active={active}
              onSelect={() => onSelect(fg.node.groupId)}
              data-testid={`cg-group-${fg.node.groupId}`}
              style={{ paddingLeft: 10 + fg.depth * 18 }}
            >
              <span className="w-0.5 inline-flex">
                <DirtyListLed groupId={fg.node.groupId} />
              </span>
              <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {fg.node.headerName}
              </span>
              <Tooltip content="Delete">
                <ChromeButton
                  type="button"
                  aria-label="Delete"
                  data-testid={`cg-delete-${fg.node.groupId}`}
                  className="w-6 h-6 inline-flex items-center justify-center rounded-sm text-muted-foreground cursor-pointer p-0 transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary-ring)]"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteGroup(fg.node.groupId, fg.path);
                  }}
                >
                  <Trash2 size={14} strokeWidth={2} />
                </ChromeButton>
              </Tooltip>
            </CockpitListItem>
          );
        })}
      </CockpitList>
    </>
  );
}

// ─── Editor pane ───────────────────────────────────────────────────────

export function ColumnGroupsEditor({ selectedId }: EditorPaneProps) {
  const [state, setState] = useModuleState<ColumnGroupsState>(MODULE_ID);
  const columns = useGridColumns();

  const assigned = useMemo(() => collectAssignedColIds(state.groups), [state.groups]);
  const unassignedColIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of columns) if (!assigned.has(c.colId)) s.add(c.colId);
    return s;
  }, [columns, assigned]);

  if (!selectedId) {
    return (
      <div className="px-6 py-8">
        <Caps size="xs" style={{ marginBottom: 8, display: 'block' }}>
          No group selected
        </Caps>
        <div className="text-xs text-muted-foreground">
          Select a group from the list, or press <Mono>+</Mono> to add one.
        </div>
      </div>
    );
  }

  // Find the path of the selected group in the committed tree. Structural
  // ops (move / delete) always commit directly to the store — they
  // manipulate tree shape, not the draft's own fields.
  const flat = flattenGroups(state.groups);
  const selectedEntry = flat.find((f) => f.node.groupId === selectedId);
  if (!selectedEntry) return null;
  const path = selectedEntry.path;

  const onMoveNode = (p: Path, direction: -1 | 1) => {
    setState((prev) => ({ ...prev, groups: moveGroupAtPath(prev.groups, p, direction) }));
  };

  return (
    <GroupEditor
      key={selectedId}
      groupId={selectedId}
      path={path}
      columns={columns}
      unassignedColIds={unassignedColIds}
      onMoveNode={onMoveNode}
      depth={selectedEntry.depth}
      isFirst={selectedEntry.siblingIndex === 0}
      isLast={selectedEntry.siblingIndex === selectedEntry.siblings - 1}
    />
  );
}

// ─── Per-group editor ──────────────────────────────────────────────────

interface GroupEditorProps {
  groupId: string;
  path: Path;
  depth: number;
  columns: readonly GridColumnInfo[];
  unassignedColIds: Set<string>;
  onMoveNode: (path: Path, direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}

const GroupEditor = memo(function GroupEditor({
  groupId,
  path,
  depth,
  columns,
  unassignedColIds,
  onMoveNode,
  isFirst,
  isLast,
}: GroupEditorProps) {
  // Draft for the selected group node. `selectItem` walks the tree to
  // find the node by id; `commitItem` writes the edited node back at the
  // same path. Same Save/Dirty flow the other editors use.
  const { draft, setDraft, dirty, save, discard, missing } = useModuleDraft<
    ColumnGroupsState,
    ColumnGroupNode
  >({
    moduleId: MODULE_ID,
    itemId: groupId,
    selectItem: (state) => {
      const flat = flattenGroups(state.groups);
      return flat.find((f) => f.node.groupId === groupId)?.node;
    },
    commitItem: (next) => (state) => ({
      ...state,
      groups: updateGroupAtPath(state.groups, path, () => next),
    }),
  });

  if (missing || !draft) return null;
  const node = draft;

  const updateDraft = (updater: (n: ColumnGroupNode) => ColumnGroupNode) => {
    setDraft((prev) => updater(prev));
  };

  const columnChildren = node.children.filter(
    (c) => c.kind === 'col',
  ) as Array<{ kind: 'col'; colId: string; show?: GroupChildShow }>;
  const subgroups = node.children.filter(
    (c) => c.kind === 'group',
  ) as Array<{ kind: 'group'; group: ColumnGroupNode }>;

  const eligibleToAdd = columns
    .filter((c) => unassignedColIds.has(c.colId) || columnChildren.some((cc) => cc.colId === c.colId))
    .filter((c) => !columnChildren.some((cc) => cc.colId === c.colId));

  const addColumn = (colId: string) => {
    if (!colId) return;
    updateDraft((n) => ({ ...n, children: [...n.children, { kind: 'col', colId }] }));
  };
  const removeColumn = (colId: string) => {
    updateDraft((n) => ({
      ...n,
      children: n.children.filter((c) => !(c.kind === 'col' && c.colId === colId)),
    }));
  };
  const cycleColumnShow = (colId: string) => {
    updateDraft((n) => ({
      ...n,
      children: n.children.map((c) => {
        if (c.kind !== 'col' || c.colId !== colId) return c;
        return { ...c, show: nextShowMode(c.show) };
      }),
    }));
  };

  // Hard cap on nesting — 3 levels total. Depth 0 = root; depth 2 is the
  // floor (no further subgroups).
  const MAX_SUBGROUP_DEPTH = 2;
  const canAddSubgroup = depth < MAX_SUBGROUP_DEPTH;

  const addSubgroup = () => {
    if (!canAddSubgroup) return;
    updateDraft((n) => ({
      ...n,
      children: [
        ...n.children,
        {
          kind: 'group',
          group: {
            groupId: generateGroupId(),
            headerName: 'New Subgroup',
            children: [],
            openByDefault: false,
          },
        },
      ],
    }));
  };

  const headerStyleValue = headerStyleToEditor(node.headerStyle);
  const onHeaderStyleChange = (patch: Partial<StyleEditorValue>) => {
    const next = headerStyleFromEditor(node.headerStyle, { ...headerStyleValue, ...patch });
    updateDraft((n) => ({ ...n, headerStyle: next }));
  };

  return (
    <div
      data-testid={`cg-group-editor-${node.groupId}`}
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
    >
      <div className="shrink-0 bg-background border-b border-border">
        <ObjectTitleRow
          title={
            <TitleInput
              value={node.headerName}
              onChange={(e) => updateDraft((n) => ({ ...n, headerName: e.target.value }))}
              placeholder="Group name"
              data-testid={`cg-name-${node.groupId}`}
            />
          }
          actions={
            <>
              <SharpBtn
                variant="ghost"
                onClick={() => !isFirst && onMoveNode(path, -1)}
                title="Move up"
                disabled={isFirst}
                data-testid={`cg-up-${node.groupId}`}
              >
                <ArrowUp size={11} strokeWidth={2} />
              </SharpBtn>
              <SharpBtn
                variant="ghost"
                onClick={() => !isLast && onMoveNode(path, 1)}
                title="Move down"
                disabled={isLast}
                data-testid={`cg-down-${node.groupId}`}
              >
                <ArrowDown size={11} strokeWidth={2} />
              </SharpBtn>
              <SharpBtn
                variant="ghost"
                disabled={!dirty}
                onClick={discard}
                data-testid={`cg-reset-${node.groupId}`}
              >
                <RotateCcw size={13} strokeWidth={2} /> RESET
              </SharpBtn>
              <SharpBtn
                variant={dirty ? 'action' : 'ghost'}
                disabled={!dirty}
                onClick={save}
                data-testid={`cg-save-${node.groupId}`}
              >
                <Save size={13} strokeWidth={2} /> SAVE
              </SharpBtn>
            </>
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-4">
        <div className="sticky top-0 z-10 shrink-0 bg-card border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap">
          <div className="w-full flex items-center gap-2 flex-wrap">
            <SummaryChip
              label="OPEN BY DEFAULT"
              tone={node.openByDefault ? 'positive' : 'neutral'}
              value={node.openByDefault ? 'ON' : 'OFF'}
            />
            <SummaryChip
              label="MARRY CHILDREN"
              tone={node.marryChildren ? 'info' : 'neutral'}
              value={node.marryChildren ? 'ON' : 'OFF'}
            />
            <SummaryChip
              label="DEPTH"
              value={<Mono>{String(depth).padStart(2, '0')}</Mono>}
              tone="info"
            />
            <SummaryChip
              label="CHILDREN"
              value={
                <Mono>
                  {columnChildren.length} col · {subgroups.length} sub
                </Mono>
              }
              tone={(columnChildren.length || subgroups.length) > 0 ? 'warning' : 'neutral'}
            />
          </div>

          <div className="w-full mt-2 flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2">
              <Caps size="2xs">OPEN BY DEFAULT</Caps>
              <Switch
                checked={!!node.openByDefault}
                onCheckedChange={(checked) => updateDraft((n) => ({ ...n, openByDefault: checked }))}
              />
            </div>
            <div className="inline-flex items-center gap-2">
              <Caps size="2xs">MARRY CHILDREN</Caps>
              <Switch
                checked={!!node.marryChildren}
                onCheckedChange={(checked) => updateDraft((n) => ({ ...n, marryChildren: checked }))}
              />
            </div>
          </div>
        </div>

        <Band
          index="01"
          title="COLUMNS"
          trailing={
            <ChromeButton
              type="button"
              onClick={addSubgroup}
              disabled={!canAddSubgroup}
              data-testid={`cg-add-sub-${node.groupId}`}
              title={canAddSubgroup ? 'Add subgroup' : 'Maximum nesting depth reached (3 levels)'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '0 10px',
                height: 24,
                fontSize: 10,
                color: 'var(--ds-text-secondary)',
                background: 'transparent',
                border: '1px solid var(--ds-border-secondary)',
                borderRadius: 2,
                cursor: canAddSubgroup ? 'pointer' : 'not-allowed',
                opacity: canAddSubgroup ? 1 : 0.35,
                fontFamily: 'var(--ds-font-sans)',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              <FolderPlus size={12} strokeWidth={1.75} /> SUBGROUP
            </ChromeButton>
          }
        >
          <div className="flex flex-wrap gap-1 items-center">
            {columnChildren.map((c) => {
              const info = columns.find((a) => a.colId === c.colId);
              const show = c.show ?? 'always';
              return (
                <span
                  key={c.colId}
                  data-v2-chip=""
                  data-show={show}
                  data-testid={`cg-chip-${node.groupId}-${c.colId}`}
                  title={showTooltip(show)}
                  className="inline-flex items-center gap-[5px] pt-[3px] pr-1 pb-[3px] pl-2 rounded-sm bg-background border border-[var(--ds-border-secondary)] font-mono text-[11px] text-foreground"
                >
                  {info?.headerName ?? c.colId}
                  <ChromeButton
                    type="button"
                    onClick={() => cycleColumnShow(c.colId)}
                    title={showTooltip(show)}
                    data-testid={`cg-chip-show-${node.groupId}-${c.colId}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 18,
                      height: 18,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: showAccentColor(show),
                      padding: 0,
                      borderRadius: 2,
                    }}
                  >
                    {showIcon(show)}
                  </ChromeButton>
                  <ChromeButton
                    type="button"
                    onClick={() => removeColumn(c.colId)}
                    title="Remove"
                    className="bg-transparent border-none cursor-pointer text-muted-foreground p-0 leading-none"
                  >
                    <XIcon size={11} />
                  </ChromeButton>
                </span>
              );
            })}
            {eligibleToAdd.length > 0 && (
              <Select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) addColumn(v);
                }}
                data-testid={`cg-add-col-${node.groupId}`}
                style={{ width: 'auto', height: 24, fontSize: 11 }}
              >
                <option value="">+ COLUMN…</option>
                {eligibleToAdd.map((c) => (
                  <option key={c.colId} value={c.colId}>
                    {c.headerName}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </Band>

        <StyleEditor
          value={headerStyleValue}
          onChange={onHeaderStyleChange}
          sections={['text', 'color', 'border']}
          dataType="text"
          data-testid={`cg-hdr-style-${node.groupId}`}
        />

        <div className="h-5" />
      </div>
    </div>
  );
});

// ─── Legacy flat composition ───────────────────────────────────────────

export function ColumnGroupsPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div
      data-testid="cg-panel"
      className="grid h-full"
      style={{ gridTemplateColumns: '220px 1fr' }}
    >
      <aside className="border-r border-border overflow-y-auto bg-card">
        <ColumnGroupsList gridId="" selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section className="overflow-y-auto">
        <ColumnGroupsEditor gridId="" selectedId={selectedId} />
      </section>
    </div>
  );
}
