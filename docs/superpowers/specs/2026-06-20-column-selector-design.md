# Column Selector — design spec

**Date:** 2026-06-20
**Package:** `@wellsfargo-starui/grid` (`packages/react-grid/grid`)
**Status:** approved, ready for implementation

## Goal

Give MarketsGrid users an easy, searchable way to choose which columns are
shown and in what order. A toolbar button opens a dialog with two lists —
**Available** (hidden columns) and **Visible** (shown columns) — each with its
own search bar. Users transfer columns between the lists and drag single or
multiple columns up/down within the Visible list to reorder them. On **Apply**,
the grid's columns are reordered so that all Visible columns come first (in the
user's order) followed by all Available columns (in their order), with Available
columns hidden. The grid customizer's Column Settings list reflects the same
order automatically because it reads from `api.getColumns()`.

## Decisions (from brainstorming)

- **List model:** Visible = currently-shown columns; Available = currently-hidden
  columns. Move Available→Visible unhides; Visible→Available hides.
- **Drag:** add `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.
- **Commit:** Apply to the live grid only (`api.applyColumnState`). Persistence
  flows through the existing toolbar Save / grid-state module — the dialog does
  not write to storage.
- **Buttons:** Apply + Cancel. Apply commits and closes; Cancel discards.
- **UI stack:** 100% shadcn primitives from `@wellsfargo-starui/ui`; all colours/spacing via
  `--ds-*` / `--bn-*` / `--fi-*` tokens; correct under both `[data-theme="dark"]`
  and `[data-theme="light"]`. No native `<input>`/`<select>`.
- **Locked columns:** columns with `colDef.lockVisible === true` (and AG-Grid
  internal `ag-Grid-*` columns) stay in Visible and cannot be transferred to
  Available. Pinned columns remain fully movable.

## Architecture

New folder `packages/react-grid/grid/src/widget/column-selector/`:

| File | Responsibility |
|---|---|
| `columnSelectorModel.ts` | **Pure** types + logic. No React, no AG-Grid. |
| `columnSelectorModel.test.ts` | Unit tests for the pure logic (TDD). |
| `gridColumnAdapter.ts` | Thin AG-Grid glue: read columns → model items; apply model → `applyColumnState`. |
| `useColumnSelectorState.ts` | Hook: draft state + per-list selection + search + handlers; seeds on open. |
| `ColumnSelectorDialog.tsx` | shadcn `Dialog`; two `ColumnList` panes, transfer buttons, footer. |
| `ColumnList.tsx` | One pane: search `Input` + scrollable list. Visible pane is dnd-kit sortable. |
| `ColumnListItem.tsx` | One selectable row (shared by both panes). |
| `index.ts` | Barrel: `ColumnSelectorDialog`, public types. |

### Pure model (`columnSelectorModel.ts`)

```ts
interface ColumnItem { colId: string; headerName: string; locked: boolean }
interface ColumnSelectorState { visible: ColumnItem[]; available: ColumnItem[] }

buildInitialState(descriptors: ColumnDescriptor[]): ColumnSelectorState
moveToVisible(state, ids: string[]): ColumnSelectorState      // append to end of visible, preserve relative order
moveToAvailable(state, ids: string[]): ColumnSelectorState    // skip locked
reorderVisible(state, ids: string[], activeColId, overColId): ColumnSelectorState  // multi-block move
filterItems(items: ColumnItem[], query: string): ColumnItem[] // case-insensitive substring on headerName + colId
computeColumnState(state): { colId: string; hide: boolean }[] // [...visible(hide:false), ...available(hide:true)]
```

- `ColumnDescriptor` = `{ colId; headerName; hidden; locked }`.
- `buildInitialState` splits by `hidden`, preserving the source order within each list.
- `reorderVisible` removes the `ids` block, then re-inserts it (in original relative
  order) relative to `overColId` — after it when dragging down, before it when dragging
  up. Dropping onto a member of the dragged selection is a no-op.
- "Add all / Remove all" are not separate functions: the buttons pass the
  currently-filtered id list to `moveToVisible` / `moveToAvailable`, so bulk
  honours the active search.

### Adapter (`gridColumnAdapter.ts`)

- `readGridColumns(api): ColumnDescriptor[]` — `api.getColumns()`, skip `ag-Grid-*`,
  `hidden = !col.isVisible()`, `locked = colDef.lockVisible === true`,
  `headerName = colDef.headerName ?? colId`.
- `applyColumnSelection(api, state)` — `api.applyColumnState({ state: computeColumnState(state), applyOrder: true })`.

### State hook (`useColumnSelectorState.ts`)

- Inputs: `api: GridApi | null`, `open: boolean`.
- Holds `state`, `visibleSelected: Set`, `availableSelected: Set`, `visibleQuery`,
  `availableQuery`, plus per-list selection anchor for shift-range.
- Reseeds `state` from `readGridColumns(api)` when `open` goes false→true.
- Selection model: click = select one; Cmd/Ctrl-click = toggle; Shift-click = range
  from anchor. Selection keyed by colId, survives search filtering.
- Handlers: `addSelected`, `removeSelected`, `addAll`, `removeAll`, `reorder`,
  `selectItem`, `apply()` (calls `applyColumnSelection`).

### Dialog (`ColumnSelectorDialog.tsx`)

- Props: `open`, `onOpenChange`, `api`.
- Layout: `DialogContent` → title → row with `[AvailableList] [transfer buttons] [VisibleList]`
  → `DialogFooter` with Cancel + Apply.
- Transfer buttons (center column, shadcn `Button` icon variants): `Add →`, `← Remove`,
  `Add all »`, `« Remove all`. Disabled when nothing applicable.
- Apply: `state.apply(); onOpenChange(false)`. Cancel: `onOpenChange(false)` (draft discarded
  on next open via reseed).

### Lists (`ColumnList.tsx` / `ColumnListItem.tsx`)

- `ColumnList`: header search `Input` (shadcn, with `Search` icon) + `ScrollArea` of items.
- Visible pane wraps items in dnd-kit `DndContext` + `SortableContext` (vertical). Dragging
  a row that's part of a multi-selection moves the whole selected block (model `reorderVisible`).
  Keyboard sensor for accessibility.
- `ColumnListItem`: selectable row showing `headerName`; selected state + drag handle styled via
  tokens; double-click moves the row to the other list; locked rows show a lock affordance and
  are not draggable/transferable.

## Wiring

- `types.ts`: add `showColumnSelector?: boolean` (default `true`) to `MarketsGridProps`.
- `useMarketsGridController.ts`: add `columnSelectorOpen` state + `setColumnSelectorOpen` +
  `handleOpenColumnSelector`; expose `api` (already present) to the host.
- `PrimaryToolbar.tsx`: add a `Columns3` icon button + props `showColumnSelector`,
  `onOpenColumnSelector`; include in the memo equality check.
- `MarketsGridHost.tsx`: render `<ColumnSelectorDialog open onOpenChange api />`; pass the new
  props to `PrimaryToolbar`; thread `showColumnSelector` down from `MarketsGrid`.
- `MarketsGrid.tsx` + `MarketsGridHostProps`: thread `showColumnSelector` (default true).
- No app change needed — `<HostedMarketsGrid>`/blotter inherit the default-on button.

## Testing

- `columnSelectorModel.test.ts`: buildInitialState split/order, moveToVisible/Available
  (incl. locked skip, relative-order preservation), reorderVisible (single + multi, up/down,
  no-op on self), filterItems, computeColumnState order + hide flags.
- Component smoke test: open dialog, type in search, transfer, Apply calls `applyColumnState`
  with the expected ordered+hidden state.
- Optional e2e under `e2e/`: toolbar → dialog → reorder → Apply → grid reflects order.
- Update `docs/current-features.md` (Column Selector bullet under the grid widget bucket).

## File-size budget

Each file well under the 800-LOC ceiling; functions under 80 LOC. The pure model is the
largest logic unit and stays small by delegating selection/UI concerns to the hook and components.
