import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  DockManagerCore,
  type DockManagerCoreHandle,
  type WidgetProps,
} from '@widgetstools/react-dock-manager';
import {
  type DockManagerState,
  type SerializedDockLayout,
  clearLocalStorage,
  deserialize,
  loadFromLocalStorage,
  saveToLocalStorage,
  slateDark,
  vsCodeLight,
} from '@widgetstools/dock-manager-core';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import {
  Button,
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarMenu,
  MenubarTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@wellsfargo-starui/react';
import { Sun, Moon, CircleHelp, LayoutTemplate, Save } from 'lucide-react';
import { Brand } from './components/Brand';
import { HelpSheet } from './components/HelpSheet';
import { ProviderEditorPanel } from './panels/ProviderEditorPanel';
import { ConfigBrowserPanel } from './panels/ConfigBrowserPanel';
import { HostedGridPanel } from './panels/HostedGridPanel';
import { StatsPanel } from './panels/StatsPanel';

// Default docked layout. Only the grids and the stats strip live in
// the dock tree — Provider Editor and Config Browser are opened on
// demand from the View menu and appear as floating, non-dockable
// panels (see openFloatingPanel below).
const SERIALIZED_LAYOUT: SerializedDockLayout = {
  version: 1,
  layout: {
    type: 'split',
    id: 'root',
    direction: 'vertical',
    sizes: [82, 18],
    children: [
      {
        type: 'split',
        id: 'top',
        direction: 'horizontal',
        sizes: [50, 50],
        children: [
          { type: 'tabgroup', id: 'tg-grid-a', panels: ['gridA'], activePanel: 'gridA' },
          { type: 'tabgroup', id: 'tg-grid-b', panels: ['gridB'], activePanel: 'gridB' },
        ],
      },
      { type: 'tabgroup', id: 'tg-stats', panels: ['stats'], activePanel: 'stats' },
    ],
  },
  panels: {
    gridA: { id: 'gridA', title: 'Grid A',     widgetType: 'gridA', closable: false },
    gridB: { id: 'gridB', title: 'Grid B',     widgetType: 'gridB', closable: false },
    stats: { id: 'stats', title: 'Live stats', widgetType: 'stats', closable: false },
  },
  placements: {
    gridA: { type: 'docked', groupId: 'tg-grid-a' },
    gridB: { type: 'docked', groupId: 'tg-grid-b' },
    stats: { type: 'docked', groupId: 'tg-stats' },
  },
  activePaneId: 'gridA',
  nextZIndex: 100,
};

const DEFAULT_LAYOUT: DockManagerState = deserialize(SERIALIZED_LAYOUT).state;

// Stable key for dock-manager-core's localStorage helpers. The suffix is
// a cache-buster: change it only when the docked-panel set changes, so
// stale persisted blobs get abandoned rather than half-restored.
const DOCK_STORAGE_KEY = 'dataprovider-editor-starui-app:dock-layout:v3';

// Panels we always require in the persisted layout. Floating-only
// panels (editor, configBrowser) are excluded — they may or may not
// be present depending on whether the user opened them before saving.
const REQUIRED_PANELS = ['gridA', 'gridB', 'stats'] as const;
const FLOATING_PANELS = ['providerEditor', 'configBrowser'] as const;
type FloatingPanelId = (typeof FLOATING_PANELS)[number];

const FLOATING_PANEL_META: Record<FloatingPanelId, { title: string; x: number; y: number; width: number; height: number }> = {
  providerEditor: { title: 'Provider Editor', x: 80,  y: 80, width: 1000, height: 660 },
  configBrowser:  { title: 'Config Browser',  x: 140, y: 120, width: 1100, height: 700 },
};

/**
 * Load the persisted dock layout if any. Falls back to DEFAULT_LAYOUT
 * on first run or when the saved blob can't be deserialized (e.g. we
 * changed the panel set in code and the persisted ids no longer
 * match).
 */
function loadInitialLayout(): DockManagerState {
  try {
    const result = loadFromLocalStorage(DOCK_STORAGE_KEY);
    if (!result) return DEFAULT_LAYOUT;
    if (result.warnings.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[dock-layout] restore warnings:', result.warnings);
    }
    // The persisted state must include every REQUIRED docked panel.
    // Extra panels are tolerated — they may be floating editor /
    // browser instances the user had open at save time. Any extras
    // outside the known floating set get logged but kept (they'll
    // render via the widget registry).
    const persistedIds = new Set(result.state.panels.keys());
    const requiredIds = new Set<string>(REQUIRED_PANELS);
    const floatingIds = new Set<string>(FLOATING_PANELS);
    const missing = [...requiredIds].filter((id) => !persistedIds.has(id));
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[dock-layout] required panels missing — using default layout.', { missing });
      return DEFAULT_LAYOUT;
    }
    const unknownExtras = [...persistedIds].filter(
      (id) => !requiredIds.has(id) && !floatingIds.has(id),
    );
    if (unknownExtras.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[dock-layout] unknown panels in persisted state', { unknownExtras });
    }
    return result.state;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[dock-layout] failed to load persisted layout', err);
    return DEFAULT_LAYOUT;
  }
}

export function App() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(
    () => getTheme().theme as 'dark' | 'light',
  );
  const isDark = theme === 'dark';
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingEditorProviderId, setPendingEditorProviderId] = useState<string | null>(null);
  const [openFloating, setOpenFloating] = useState<Set<FloatingPanelId>>(() => new Set());
  const dockRef = useRef<DockManagerCoreHandle | null>(null);

  // Toggle a floating panel via the dock-manager API. First open
  // adds the panel and floats it; subsequent toggles close (remove
  // from state). `dockable: false` + `allowDocking: false` block
  // drag-to-dock so the panel can only ever be a floating overlay.
  const toggleFloatingPanel = useCallback((id: FloatingPanelId) => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    if (api.hasPanel(id)) {
      api.closePanel(id);
      setOpenFloating((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    const meta = FLOATING_PANEL_META[id];
    api.addPanel({
      panelId: id,
      title: meta.title,
      widgetType: id,
      dockable: false,
      floatable: true,
      closable: true,
      targetGroupId: 'tg-stats',
    });
    api.floatPanel({
      panelId: id,
      x: meta.x,
      y: meta.y,
      width: meta.width,
      height: meta.height,
    });
    api.updatePanel(id, { allowDocking: false });
    api.bringToFront(id);
    setOpenFloating((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Reflect whatever panels are in the persisted layout into
  // openFloating so the menubar checkmarks match reality on first
  // paint. Runs once after mount.
  useEffect(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    const present = FLOATING_PANELS.filter((id) => api.hasPanel(id));
    if (present.length > 0) setOpenFloating(new Set(present));
  }, []);

  // Keep the menubar checkmarks in sync when the user closes a
  // floating panel via its X button (rather than via the menu).
  const handleWillClose = useCallback((_e: unknown, panelId: string) => {
    if ((FLOATING_PANELS as readonly string[]).includes(panelId)) {
      setOpenFloating((prev) => {
        if (!prev.has(panelId as FloatingPanelId)) return prev;
        const next = new Set(prev);
        next.delete(panelId as FloatingPanelId);
        return next;
      });
    }
  }, []);

  // Resolve initial dock layout once, at mount. Reading from
  // localStorage on every render would re-mount DockManagerCore with
  // a stale state and lose any unsaved drag-in-progress.
  const [initialLayout] = useState<DockManagerState>(() => loadInitialLayout());

  // Explicit save — user-triggered via the header button. Pulls the
  // current state from the dock-manager API and writes it.
  const handleSaveLayout = useCallback(() => {
    const state = dockRef.current?.getState();
    if (!state) return;
    try {
      saveToLocalStorage(state, DOCK_STORAGE_KEY);
      // eslint-disable-next-line no-console
      console.log('[dock-layout] saved');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[dock-layout] save failed', err);
    }
  }, []);

  const handleResetLayout = useCallback(() => {
    if (!window.confirm('Reset dock layout to defaults? This will clear the saved arrangement for this app.')) {
      return;
    }
    try {
      clearLocalStorage(DOCK_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  }, []);

  const handleToggleTheme = useCallback(() => {
    const next: 'dark' | 'light' = isDark ? 'light' : 'dark';
    applyTheme({ ...getTheme(), theme: next }); // spread keeps cvd/variant
    setThemeState(next);
  }, [isDark]);

  // When a grid asks to edit a provider, summon the editor panel
  // (open it if it isn't already) and pre-focus the row.
  const handleEditProvider = useCallback((providerId: string) => {
    setPendingEditorProviderId(providerId);
    const api = dockRef.current?.getApi();
    if (!api) return;
    if (!api.hasPanel('providerEditor')) {
      toggleFloatingPanel('providerEditor');
    } else {
      api.bringToFront('providerEditor');
    }
  }, [toggleFloatingPanel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === '/') {
        e.preventDefault();
        setHelpOpen((o) => !o);
      } else if (k === '.') {
        e.preventDefault();
        handleToggleTheme();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleToggleTheme]);

  const dockTheme = useMemo(() => (isDark ? slateDark : vsCodeLight), [isDark]);
  const tooltipLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  const widgets = useMemo<Record<string, React.ComponentType<WidgetProps>>>(
    () => ({
      providerEditor: () => (
        <ProviderEditorPanel
          initialProviderId={pendingEditorProviderId}
          onClose={() => setPendingEditorProviderId(null)}
        />
      ),
      configBrowser: () => <ConfigBrowserPanel />,
      gridA: () => (
        <HostedGridPanel
          instanceId="dataprovider-editor-demo-a"
          componentName="Grid A"
          onEditProvider={handleEditProvider}
        />
      ),
      gridB: () => (
        <HostedGridPanel
          instanceId="dataprovider-editor-demo-b"
          componentName="Grid B"
          onEditProvider={handleEditProvider}
        />
      ),
      stats: () => <StatsPanel />,
    }),
    [pendingEditorProviderId, handleEditProvider],
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
      <header className="relative flex h-[52px] shrink-0 items-center gap-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-4 pr-3">
        <Brand />
        <div className="ml-2 h-6 w-px bg-[color:var(--ds-border-primary)]" />
        <Menubar className="h-8 border-none bg-transparent p-0 shadow-none">
          <MenubarMenu>
            <MenubarTrigger className="h-7 px-2 font-mono text-[11px] font-medium tracking-tight text-[color:var(--ds-text-secondary)] data-[state=open]:bg-[color:var(--ds-surface-secondary)] data-[state=open]:text-[color:var(--ds-text-primary)]">
              View
            </MenubarTrigger>
            <MenubarContent align="start" className="min-w-[220px]">
              <MenubarCheckboxItem
                checked={openFloating.has('providerEditor')}
                onCheckedChange={() => toggleFloatingPanel('providerEditor')}
              >
                Provider Editor
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={openFloating.has('configBrowser')}
                onCheckedChange={() => toggleFloatingPanel('configBrowser')}
              >
                Config Browser
              </MenubarCheckboxItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
        <div className="ml-auto flex items-center gap-2">
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSaveLayout}
                  aria-label="Save dock layout"
                  className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]"
                  data-testid="save-layout"
                >
                  <Save size={13} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Save dock layout</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleResetLayout}
                  aria-label="Reset dock layout to defaults"
                  className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]"
                  data-testid="reset-layout"
                >
                  <LayoutTemplate size={13} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Reset dock layout</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setHelpOpen(true)}
                  aria-label="Open help"
                  className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]"
                  data-testid="help-toggle"
                >
                  <CircleHelp size={13} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Help (Ctrl + /)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleToggleTheme}
                  aria-label={tooltipLabel}
                  className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]"
                  data-testid="theme-toggle"
                >
                  {isDark ? <Sun size={13} strokeWidth={1.75} /> : <Moon size={13} strokeWidth={1.75} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] shadow-[var(--ds-elevation-card)]">
          <DockManagerCore
            ref={dockRef}
            initialState={initialLayout}
            onWillClose={handleWillClose}
            widgets={widgets}
            theme={dockTheme}
            className="h-full w-full"
          />
        </div>
      </main>
    </div>
  );
}
