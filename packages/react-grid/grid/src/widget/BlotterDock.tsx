/**
 * One `@widgetstools/react-dock-manager` instance shared by the blotter
 * (`MarketsGridSurface`) and every summary-panel widget — matching the
 * trading-app reference example's own use of AG-Grid as ordinary dock-panel
 * content (`OrderBlotter.tsx` — same `ag-grid-react`, same dock library),
 * extended so the summary widgets dock, float, and pin around it freely.
 *
 * The blotter panel is built ONCE, at mount, and is never closed, re-added,
 * or otherwise touched by a dispatch — only ever repositioned by the dock's
 * OWN internal drag/resize handling. That is deliberate: AG-Grid's live
 * state (column widths, sort, filters, selection, scroll position) lives
 * inside its own instance, and a panel getting closed-then-re-added (or the
 * whole dock remounting) would tear that down. Summary widgets are added,
 * removed, and renamed through the dock's public mutation API
 * (`dispatch`/`ADD_PANEL`, `api.closePanel`, `api.updatePanel`) instead of
 * rebuilding the layout and remounting — the same reason: a remount would
 * take the blotter panel down with it. Every other summary-widget field edit
 * (kind/query/chartKind) needs no dock action at all — panel content reads
 * the current widget live from `SummaryWidgetDataContext`.
 *
 * The blotter panel's own header — a single-panel dock group's built-in
 * title bar — starts (and stays) collapsed whenever there are zero summary
 * widgets, and is uncollapsed the moment one exists, via
 * `SET_HEADER_COLLAPSED`. With nothing to show alongside it, a lone header
 * naming the one panel that's always there is just chrome with nothing to
 * say; once a widget is docked next to it, the header is what tells the two
 * apart — and what carries the blotter's maximize button (below), which
 * only has anything to do once something else is sharing the space.
 *
 * Widgets are fully interactive — closable, floatable, dockable, pinnable.
 * The blotter panel is none of those, with ONE exception: `allowMaximize`.
 * Maximizing is the only panel action that can't cost anything here — it
 * can't close the panel, unmount the grid, or leave it at zero width (the
 * three ways AG-Grid's live state gets torn down); it only makes the panel
 * bigger. And it's the natural way back to a full-size grid once summary
 * widgets are taking up room, which is exactly when it becomes reachable:
 * the header carrying the button is collapsed until a widget exists.
 * `SummaryPanelState.widgets` (order + existence) stays the source of truth
 * for WHICH widgets exist; where the user has dragged them is the dock's own
 * business and isn't written back.
 *
 * Because widgets ARE freely dockable, a widget CAN be dropped directly onto
 * the blotter's own tab, sharing its group — which would hide the blotter
 * whenever that widget's tab is active. `useBlotterVisibilityGuard`
 * (`BlotterPanelContent` below) exists for exactly that case: an inactive
 * dock panel collapses to zero width, and AG-Grid can't measure a viewport
 * at zero width, so it abandons column virtualisation and synchronously
 * renders every column — a well-documented, ~15x-worse render that lands
 * right on the click that triggers it. The guard tears AG-Grid down before
 * that collapse happens and remounts it once the panel is visible again,
 * preserving column/filter/scroll state across the cycle.
 */
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from 'react';
import { DockManagerCore, type WidgetProps, type DockManagerCoreHandle } from '@widgetstools/react-dock-manager';
import type {
  DockManagerState,
  DockPosition,
  DockviewApi,
  LayoutNode,
  PanelConfig,
  Placement,
  PreventableDockEvent,
} from '@widgetstools/dock-manager-core';
import '@widgetstools/react-dock-manager/styles.css';
import {
  useSummaryPanelData,
  SummaryWidgetContent,
  type SummaryWidget,
  type SummaryWidgetKind,
} from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import type { GridReadyEvent } from 'ag-grid-community';
import { useActiveThemeMode } from '../customizer/hooks/useActiveThemeMode';
import { MarketsGridSurface, type MarketsGridSurfaceProps } from './MarketsGridSurface';
import { useBlotterVisibilityGuard } from './useBlotterVisibilityGuard';

const BLOTTER_PANEL_ID = 'blotter';
const BLOTTER_GROUP_ID = 'blotter-group';
const SUMMARY_WIDGET_TYPE = 'summary-widget';

const KIND_LABEL: Record<SummaryWidgetKind, string> = { digest: 'Digest', chart: 'Chart', heatmap: 'Heatmap' };

function summaryGroupId(widgetId: string): string {
  return `summary-panel-group-${widgetId}`;
}

function widgetTitle(widget: SummaryWidget): string {
  return widget.title || KIND_LABEL[widget.kind];
}

function widgetPanelConfig(widget: SummaryWidget): PanelConfig {
  return {
    id: widget.id,
    title: widgetTitle(widget),
    widgetType: SUMMARY_WIDGET_TYPE,
    closable: true,
    floatable: true,
    dockable: true,
    allowDocking: true,
    allowPinning: true,
    allowMaximize: true,
  };
}

/** The blotter alone, or the blotter with every CURRENTLY-configured widget
 *  docked above it in an even horizontal row — the layout new adds keep
 *  growing rightward from. Built once, at mount; every later widget change
 *  goes through `reconcileWidgets` instead. */
function buildInitialState(widgets: readonly SummaryWidget[], blotterTitle: string): DockManagerState {
  const panels = new Map<string, PanelConfig>();
  const placements = new Map<string, Placement>();

  panels.set(BLOTTER_PANEL_ID, {
    id: BLOTTER_PANEL_ID,
    title: blotterTitle,
    closable: false,
    floatable: false,
    dockable: false,
    allowDocking: false,
    // The one interaction the blotter panel DOES allow — see the module doc
    // comment. Only reachable once a summary widget exists, since the header
    // that carries the button is collapsed until then.
    allowMaximize: true,
    allowPinning: false,
  });
  placements.set(BLOTTER_PANEL_ID, { type: 'docked', groupId: BLOTTER_GROUP_ID });
  const blotterGroup: LayoutNode = {
    type: 'tabgroup',
    id: BLOTTER_GROUP_ID,
    panels: [BLOTTER_PANEL_ID],
    activePanel: BLOTTER_PANEL_ID,
    headerCollapsed: widgets.length === 0,
  };

  if (widgets.length === 0) {
    return { layout: blotterGroup, panels, placements, activePaneId: BLOTTER_PANEL_ID, nextZIndex: 100 };
  }

  const widgetGroups: LayoutNode[] = widgets.map((widget) => {
    const groupId = summaryGroupId(widget.id);
    panels.set(widget.id, widgetPanelConfig(widget));
    placements.set(widget.id, { type: 'docked', groupId });
    return { type: 'tabgroup', id: groupId, panels: [widget.id], activePanel: widget.id };
  });
  const evenSize = 100 / widgets.length;
  const summaryRow: LayoutNode = {
    type: 'split',
    id: 'summary-panel-row',
    direction: 'horizontal',
    children: widgetGroups,
    sizes: widgets.map(() => evenSize),
  };

  return {
    layout: { type: 'split', id: 'blotter-dock-root', direction: 'vertical', children: [summaryRow, blotterGroup], sizes: [30, 70] },
    panels,
    placements,
    activePaneId: BLOTTER_PANEL_ID,
    nextZIndex: 100,
  };
}

/** Brings the dock's actual widget panels in line with `widgets` — added,
 *  removed, or renamed — via the dock's own mutation API, never by rebuilding
 *  `DockManagerState` and remounting (that would take the permanent blotter
 *  panel down with it). New panels are added relative to the right-most
 *  CURRENTLY-DOCKED widget (falling back to the blotter's own group, docking
 *  above it, when none remain) — read fresh from the live API each pass
 *  rather than remembered across calls, so a widget the user has since
 *  floated, unpinned, or closed by hand never leaves a stale anchor behind. */
function reconcileWidgets(handle: DockManagerCoreHandle, widgets: readonly SummaryWidget[]): void {
  const api = handle.getApi();
  if (!api) return;

  const currentIds = api.getAllPanelIds().filter((id) => id !== BLOTTER_PANEL_ID);
  const currentSet = new Set(currentIds);
  const desiredSet = new Set(widgets.map((w) => w.id));

  for (const id of currentIds) {
    if (!desiredSet.has(id)) api.closePanel(id);
  }

  let anchorGroupId = BLOTTER_GROUP_ID;
  let anchorPosition: DockPosition = 'top';
  const stillDocked = widgets.filter((w) => currentSet.has(w.id));
  const lastDocked = stillDocked[stillDocked.length - 1];
  if (lastDocked) {
    anchorGroupId = api.getGroupForPanel(lastDocked.id) ?? BLOTTER_GROUP_ID;
    anchorPosition = 'right';
  }

  for (const widget of widgets) {
    if (currentSet.has(widget.id)) {
      const panel = api.getPanel(widget.id);
      const title = widgetTitle(widget);
      if (panel && panel.title !== title) api.updatePanel(widget.id, { title });
      continue;
    }
    handle.dispatch({
      type: 'ADD_PANEL',
      panelId: widget.id,
      config: widgetPanelConfig(widget),
      target: anchorGroupId,
      position: anchorPosition,
    });
    anchorGroupId = api.getGroupForPanel(widget.id) ?? anchorGroupId;
    anchorPosition = 'right';
  }

  handle.dispatch({ type: 'SET_HEADER_COLLAPSED', groupId: BLOTTER_GROUP_ID, collapsed: widgets.length === 0 });
}

// ─── Widget panel content ──────────────────────────────────────────────────

interface SummaryWidgetDataContextValue {
  rows: Record<string, unknown>[];
  widgetsById: Map<string, SummaryWidget>;
}

const SummaryWidgetDataContext = createContext<SummaryWidgetDataContextValue>({ rows: [], widgetsById: new Map() });

function SummaryWidgetPanel({ panelId }: WidgetProps) {
  const { rows, widgetsById } = useContext(SummaryWidgetDataContext);
  const widget = widgetsById.get(panelId);
  if (!widget) return null;
  return (
    <div className="h-full overflow-auto">
      <SummaryWidgetContent widget={widget} rows={rows} />
    </div>
  );
}

const DOCK_WIDGETS = { [SUMMARY_WIDGET_TYPE]: SummaryWidgetPanel };

// ─── Public component ──────────────────────────────────────────────────────

export interface BlotterDockProps<TData> extends MarketsGridSurfaceProps<TData> {
  /** Shown in the blotter panel's dock header. Falls back to a generic label. */
  title?: string;
}

export function BlotterDock<TData>({ title, ...surfaceProps }: BlotterDockProps<TData>) {
  const { widgets, rows, removeWidget } = useSummaryPanelData();
  const dockRef = useRef<DockManagerCoreHandle>(null);
  const [api, setApi] = useState<DockviewApi | null>(null);

  // Captured once — DockShell's own initial layout only ever needs the
  // widgets that existed the moment IT first mounts; every later
  // add/remove/rename reconciles into the live dock instead (see the module
  // doc comment for why the dock can never remount).
  const [initialWidgets] = useState(widgets);

  useEffect(() => {
    if (!api) return;
    reconcileWidgets(dockRef.current!, widgets);
  }, [api, widgets]);

  const contextValue = useMemo<SummaryWidgetDataContextValue>(
    () => ({ rows, widgetsById: new Map(widgets.map((w) => [w.id, w])) }),
    [rows, widgets],
  );

  // `MarketsGridSurfaceProps` carries a ref, callbacks, and a `gridOptions`
  // object that the CALLER (MarketsGridHost) already keeps referentially
  // stable across renders — but `{ title, ...surfaceProps }` above rebuilds
  // a BRAND NEW object on every BlotterDock render regardless (object rest
  // always allocates), even when every field inside it is unchanged. Without
  // this, that fresh-every-render object would defeat DockShell's own
  // memoization below and force the whole dock (blotter included) to
  // re-render on every summary-widget row refresh — the single biggest cost
  // in this file, and worse the more widgets are configured, since more
  // widgets means more frequent refreshes contending for the same paint.
  const stableSurfaceProps = useMemo(
    () => surfaceProps,
    [
      surfaceProps.gridRef,
      surfaceProps.gridOptions,
      surfaceProps.hostOverrideKeys,
      surfaceProps.theme,
      surfaceProps.rowData,
      surfaceProps.columnDefs,
      surfaceProps.rowHeight,
      surfaceProps.headerHeight,
      surfaceProps.animateRows,
      surfaceProps.sideBar,
      surfaceProps.statusBar,
      surfaceProps.defaultColDef,
      surfaceProps.getContextMenuItems,
      surfaceProps.onGridReady,
      surfaceProps.onGridPreDestroyed,
      surfaceProps.includeAllStreamSafeFilters,
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ],
  );

  // The blotter panel is `closable: false`, so this only ever fires for a
  // widget — closing it from its dock header is a convenience alias for the
  // settings panel's delete button / the chatbot's remove_module_item. The
  // dock's own CLOSE_PANEL proceeds regardless (nothing here calls
  // `event.preventDefault()`); `reconcileWidgets` then sees the id missing
  // from the next `widgets` and leaves it closed rather than re-adding it.
  // `removeWidget` is stable (see useSummaryPanelData), so this never
  // invalidates DockShell's memoization either.
  const handleWillClose = useCallback(
    (_event: PreventableDockEvent, panelId: string) => {
      if (panelId !== BLOTTER_PANEL_ID) removeWidget(panelId);
    },
    [removeWidget],
  );

  return (
    <div className="flex-1 min-h-0" data-testid="blotter-dock">
      <SummaryWidgetDataContext.Provider value={contextValue}>
        <DockShell
          dockRef={dockRef}
          initialWidgets={initialWidgets}
          title={title}
          surfaceProps={stableSurfaceProps}
          onReady={setApi}
          onWillClose={handleWillClose}
        />
      </SummaryWidgetDataContext.Provider>
    </div>
  );
}

interface DockShellProps<TData> {
  dockRef: RefObject<DockManagerCoreHandle | null>;
  initialWidgets: readonly SummaryWidget[];
  title: string | undefined;
  surfaceProps: MarketsGridSurfaceProps<TData>;
  onReady: (api: DockviewApi) => void;
  onWillClose: (event: PreventableDockEvent, panelId: string) => void;
}

/**
 * The actual `<DockManagerCore>` mount — split out and memoized so that a
 * summary-widget row-data refresh (which updates `SummaryWidgetDataContext`
 * every debounce cycle, and does need to reach widget content) never also
 * re-renders the dock itself, which would mean re-rendering the ENTIRE
 * layout tree the live, streaming AG-Grid instance sits in for no reason.
 * Only `title`/`surfaceProps` actually changing re-renders this — both are
 * referentially stable from BlotterDock unless the host genuinely passes
 * something new.
 */
const DockShell = memo(function DockShell<TData>({
  dockRef,
  initialWidgets,
  title,
  surfaceProps,
  onReady,
  onWillClose,
}: DockShellProps<TData>) {
  const theme = useActiveThemeMode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialState = useMemo(() => buildInitialState(initialWidgets, title || 'Grid'), []);

  const renderPanel = useCallback(
    (panelId: string) => (panelId === BLOTTER_PANEL_ID ? <BlotterPanelContent surfaceProps={surfaceProps} /> : null),
    [surfaceProps],
  );

  return (
    <DockManagerCore
      ref={dockRef}
      initialState={initialState}
      widgets={DOCK_WIDGETS}
      renderPanel={renderPanel}
      theme={theme}
      onReady={onReady}
      onWillClose={onWillClose}
    />
  );
}) as <TData>(props: DockShellProps<TData>) => ReactElement;

/**
 * The blotter panel's actual content: `MarketsGridSurface`, gated by
 * `useBlotterVisibilityGuard` (see that file for why — summary widgets are
 * freely dockable and can be dropped directly onto the blotter's own tab,
 * which would otherwise leave a real, wide, streaming AG-Grid instance
 * sitting at zero width and rendering every column on every tab switch).
 *
 * Also carries the `flex`/height fix `MarketsGridSurface` needs: it wraps
 * AG-Grid in a `<div style={{ flex: 1 }}>`, which needs a `display: flex`
 * ancestor with a definite height to actually grow into (see that
 * component's own doc comment). The dock's own panel-content container
 * (`.dock-panel-render-container`) is a plain `width/height: 100%` block,
 * not a flex container, so `flex: 1` is inert there and AG-Grid would
 * otherwise get no real height for its row body — the header still shows
 * (AG-Grid gives it a fixed pixel height regardless), but the rows never get
 * canvas space, which reads as "the blotter isn't filling its panel". This
 * wrapper — which doubles as the visibility guard's ResizeObserver target —
 * gives MarketsGridSurface the flex context it expects.
 */
function BlotterPanelContent<TData>({ surfaceProps }: { surfaceProps: MarketsGridSurfaceProps<TData> }) {
  const getApi = useCallback(() => surfaceProps.gridRef.current?.api ?? null, [surfaceProps.gridRef]);
  const { isMounted, containerRef, restoreState } = useBlotterVisibilityGuard(BLOTTER_PANEL_ID, getApi);

  const onGridReady = useCallback(
    (event: GridReadyEvent) => {
      surfaceProps.onGridReady(event);
      restoreState(event.api);
    },
    [surfaceProps, restoreState],
  );

  return (
    <div ref={containerRef} style={{ display: 'flex', height: '100%' }}>
      {isMounted && <MarketsGridSurface {...surfaceProps} onGridReady={onGridReady} />}
    </div>
  );
}
