import { forwardRef, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import './grid-chrome.css';
import {
  type AnyModule,
} from '@wellsfargo-starui/engine';
import { isOpenFin } from '../runtime/openFin.js';
import {
  Poppable,
  SharpBtn,
  ChromeButton,
  useDirtyCount,
  useGridPlatform,
  type PoppableHandle,
} from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { Drawer, DrawerContent, DrawerTitle } from '@wellsfargo-starui/ui';
import { GENERAL_SETTINGS_MODULE_ID } from '../customizer/modules/general-settings';
import {
  GripHorizontal,
  HelpCircle,
  X,
} from 'lucide-react';
import { HelpPanel } from './HelpPanel';
import { SettingsModuleMenubar } from './SettingsModuleMenubar';

/**
 * Cockpit Terminal popout — the v2 settings sheet.
 *
 * Chrome:
 *   - Title bar: terminal ticker with grip + green dot + "GRID CUSTOMIZER v2.3.0"
 *     + profile status + dirty count + help + pop-out + close.
 *   - Body: 3-col grid (module rail, items list, editor).
 *   - Footer: save-per-rule keyboard hints + Done CTA.
 */

/**
 * Back-compat aliases. The original flat panels exposed a top-level
 * testid per module (`cs-panel`, `cg-panel`, `cc-panel`). The
 * master-detail split removed those wrappers; this map lets the sheet
 * re-emit the same id on the editor-pane wrapper so existing e2e
 * tests keep working without having to relearn every selector.
 */
const PANEL_TESTID_BY_MODULE_ID: Record<string, string> = {
  'general-settings': 'go-panel',
  'conditional-styling': 'cs-panel',
  'column-groups': 'cg-panel',
  'calculated-columns': 'cc-panel',
  // column-customization renders master-detail via ListPane/EditorPane
  // (no legacy flat panel), so the wrapper here carries the back-compat
  // `cols-panel` testid the e2e helpers + docs consistently target.
  'column-customization': 'cols-panel',
  alerts: 'alerts-panel',
  'smart-edit': 'smart-edit-panel',
  'bulk-update': 'bulk-update-panel',
  'plus-minus': 'plus-minus-panel',
  shortcuts: 'shortcuts-panel',
  'data-change-history': 'edit-history-panel',
  'toolbar-date-settings': 'toolbar-date-settings-panel',
};

/** Default module when the customizer opens (Grid Options). */
export const DEFAULT_SETTINGS_MODULE_ID = GENERAL_SETTINGS_MODULE_ID;

export interface SettingsSheetProps {
  modules: AnyModule[];
  open: boolean;
  onClose: () => void;
  initialModuleId?: string;
  /**
   * Imperative "jump to this module + select this item" request. Each
   * distinct `nonce` re-applies the navigation even when the same module /
   * item is targeted twice (e.g. right-click → Settings on the same column
   * after the sheet was closed). Drives the cell context menu's "Settings"
   * action: navigate to Column Settings and pre-select the clicked column.
   */
  focusRequest?: { moduleId: string; itemId: string | null; nonce: number };
}

/**
 * Imperative handle exposed via `ref` on `<SettingsSheet>`. Thin
 * alias over `PoppableHandle` — lets MarketsGrid's settings icon
 * raise a buried popout before falling back to inline toggle.
 */
export type SettingsSheetHandle = PoppableHandle;


export const SettingsSheet = forwardRef<SettingsSheetHandle, SettingsSheetProps>(function SettingsSheet({
  modules,
  open,
  onClose,
  initialModuleId,
  focusRequest,
}: SettingsSheetProps, ref) {
  // Every module panel is already mounted inside MarketsGrid's
  // <GridProvider>, so `useGridPlatform()` is always valid here. Pull
  // `gridId` from the platform instead of threading a redundant `core`
  // prop (phase 4 removed the dead core/store props).
  const platform = useGridPlatform();
  const gridId = platform.gridId;

  // Live DIRTY=NN counter — reads the per-platform DirtyBus directly.
  // Every module panel registers `${moduleId}:${itemId}` through
  // `useModuleDraft` (phase 3), so the count reflects the real number
  // of unsaved card drafts across all panels. Declared UP HERE (before
  // the `if (!open)` bailout) so the Rules of Hooks hold across the
  // closed→open transition.
  const dirtyCount = useDirtyCount();

  const panelModules = useMemo(
    () => modules.filter((m) => m.SettingsPanel || (m.ListPane && m.EditorPane)),
    [modules],
  );

  const resolveDefaultModuleId = useCallback(
    () =>
      initialModuleId ??
      panelModules.find((m) => m.id === DEFAULT_SETTINGS_MODULE_ID)?.id ??
      panelModules[0]?.id ??
      '',
    [initialModuleId, panelModules],
  );

  const [activeId, setActiveId] = useState<string>(resolveDefaultModuleId);
  // When true, the body area renders the Help cheatsheet instead of the
  // active module's ListPane / EditorPane. Toggled by the ? icon in the
  // header — a temporary view, not persisted.
  const [helpOpen, setHelpOpen] = useState(false);

  // Two-phase open. The drawer shell + chrome commit on the urgent
  // update so the slide-in animation starts on the next frame; the
  // active module panel — the expensive part (Grid Options alone mounts
  // ~100 controls) — fills in on the deferred follow-up render instead
  // of blocking the animation's first frame. The `false` initial value
  // keeps the FIRST open two-phase too (useDeferredValue otherwise
  // returns the live value on initial mount, and the sheet mounts fresh
  // at first open). Popped mode bypasses the gate below — the OS window
  // keeps its content regardless of the inline `open` flag.
  const deferredOpen = useDeferredValue(open, false);

  const [selectedByModule, setSelectedByModule] = useState<Record<string, string | null>>({});

  const setSelectedForModule = useCallback((moduleId: string, id: string | null) => {
    setSelectedByModule((prev) => ({ ...prev, [moduleId]: id }));
  }, []);

  // Each open starts on Grid Options unless the host overrides `initialModuleId`.
  useEffect(() => {
    if (!open) return;
    setActiveId(resolveDefaultModuleId());
    setHelpOpen(false);
  }, [open, resolveDefaultModuleId]);

  useEffect(() => {
    if (panelModules.length === 0) return;
    if (!panelModules.some((m) => m.id === activeId)) {
      setActiveId(resolveDefaultModuleId());
    }
    // Reason: this effect repairs `activeId` when modules disappear
    // (e.g. a module unregisters at runtime). It only needs to fire on
    // module-set changes — listing `activeId` would loop (effect sets
    // activeId → effect re-fires); listing `panelModules` (the array)
    // would re-fire on identity churn from any module-state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, panelModules.length, resolveDefaultModuleId]);

  // Apply an imperative focus request (cell context menu → "Settings").
  // Declared AFTER the open-reset + activeId-repair effects so that when a
  // request opens the sheet (open false→true AND nonce changes in one
  // commit), this runs last and its module wins over the default-module
  // reset. The nonce ref guards against re-applying on unrelated renders.
  const lastFocusNonce = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.nonce === lastFocusNonce.current) return;
    if (!panelModules.some((m) => m.id === focusRequest.moduleId)) return;
    lastFocusNonce.current = focusRequest.nonce;
    setActiveId(focusRequest.moduleId);
    setSelectedForModule(focusRequest.moduleId, focusRequest.itemId);
    setHelpOpen(false);
  }, [focusRequest, panelModules, setSelectedForModule]);

  // Keydown listener is registered once per `open` flip — NOT on every
  // `onClose` identity change. Callers often pass an inline arrow as
  // onClose; without the ref-bridge below, the listener would tear down
  // and re-attach on every parent render while the sheet is open.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // An open Radix popup (menubar menu, select, popover…) owns this
        // Escape — it closes itself; the sheet must stay open. Popup
        // content is portaled to body, so when one is open the event
        // target sits inside a popper wrapper rather than the sheet.
        const target = e.target as HTMLElement | null;
        if (
          target?.closest(
            '[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"]',
          )
        ) {
          return;
        }
        onCloseRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onCloseRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const activeModule = panelModules.find((m) => m.id === activeId);
  const hasMasterDetail = Boolean(activeModule?.ListPane && activeModule?.EditorPane);
  const ListPane = activeModule?.ListPane;
  const EditorPane = activeModule?.EditorPane;
  const LegacyPanel = activeModule?.SettingsPanel;
  const selectedId = activeModule ? selectedByModule[activeModule.id] ?? null : null;

  // Build the sheet JSX. Takes `popped` + `PopoutButton` from the
  // enclosing <Poppable/> so it can:
  //   - swap chrome (strip grip/title/close when popped — OS window
  //     owns those)
  //   - drop in the pop-out trigger button in the header icon cluster
  // See Poppable's render-prop API for the contract.
  const buildSheet = ({ popped, PopoutButton, close }: {
    popped: boolean;
    PopoutButton: React.ComponentType<{ className?: string; title?: string; 'data-testid'?: string }>;
    close: () => void;
  }) => {
    // Only apply drag-region chrome when the popout is hosted by
    // OpenFin (which supports `-webkit-app-region` + `frame: false`).
    // Browsers ignore those and always render full OS chrome, so our
    // custom titlebar would just duplicate it there.
    const frameless = popped && isOpenFin();
    // Heavy module panes mount one transition behind the chrome — see
    // the deferredOpen note above. All structural wrappers (testids,
    // layout) stay in the first commit so selectors resolve immediately.
    const panelReady = popped || deferredOpen;
    const sheetClasses = [
      'ds-sheet',
      'ds-sheet-v2',
      // Inline drawer: fill the vaul panel (no centered fixed modal chrome).
      // Popped OS window: full-viewport `.ds-popout` shell.
      popped ? 'ds-popout' : 'ds-drawer-shell',
      popped ? 'is-popped' : '',
      frameless ? 'is-frameless' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
    <div
      className={sheetClasses}
      role="dialog"
      aria-label="Grid settings"
    >
          {/* ── Title bar (terminal chrome) ───────────────────────
               In OpenFin popped mode the OS frame is dropped
               (`frame: false` below), so the header strip IS the
               window's drag handle — we reassert the original brand
               cluster (grip + dot + caption) so users can still see
               what window they're in AND the strip has content to
               drag. Browsers keep OS chrome so the brand cluster is
               redundant there and stays hidden (inline mode keeps
               its original behavior). */}
          <header
            className="ds-popout-title"
            style={frameless ? ({ WebkitAppRegion: 'drag' } as CSSProperties) : undefined}
          >
            {/* Brand cluster shown inline AND in frameless popped
                mode (where our strip is the only title bar). Hidden
                in browser popped mode, because the OS title bar
                already labels the window. */}
            {(!popped || frameless) && (
              <>
                <GripHorizontal size={14} color="var(--ds-text-faint)" />
                <span className="text-[var(--ds-accent-positive)] text-[11px]">●</span>
                <span className="ds-popout-title-text">Grid Customizer</span>
                <span className="ds-popout-title-sub">v2.3.0</span>
              </>
            )}

            <span className="flex-1" />
            <span className="ds-popout-title-status">
              DIRTY=<strong style={{ color: dirtyCount > 0 ? 'var(--ds-accent-warning)' : 'var(--ds-text-secondary)' }}>
                {String(dirtyCount).padStart(2, '0')}
              </strong>
            </span>
            {/* Right-side control cluster. Entire container opts
                out of the frameless drag region so every button
                inside registers clicks instead of moving the
                OpenFin window. */}
            <div
              className="ds-popout-title-actions"
              style={frameless ? ({ WebkitAppRegion: 'no-drag' } as CSSProperties) : undefined}
            >
              <ChromeButton
                type="button"
                className="ds-popout-title-btn"
                onClick={() => setHelpOpen((v) => !v)}
                title={helpOpen ? 'Back to settings' : 'Formats & expressions help'}
                aria-label={helpOpen ? 'Back to settings' : 'Open formats and expressions help'}
                aria-pressed={helpOpen}
                data-testid="v2-settings-help-btn"
                style={helpOpen ? { color: 'var(--ds-accent-positive)' } : undefined}
              >
                <HelpCircle size={12} strokeWidth={2} />
              </ChromeButton>
              {/* Pop-out button from <Poppable> — rendered only when
                  inline; hides itself when popped (the OS window
                  chrome takes over). */}
              <PopoutButton
                className="ds-popout-title-btn"
                title="Open in a separate window"
                data-testid="v2-settings-popout-btn"
              />
              {/* Close X shown inline (browser can't reach OS close)
                  AND in frameless-popped mode (OS chrome is gone,
                  so our own X is the only close affordance). In
                  framed-popped mode (browser popout with OS chrome)
                  the OS window close handles it. */}
              {(!popped || frameless) && (
                <ChromeButton
                  type="button"
                  className="ds-popout-title-btn"
                  onClick={() => {
                    if (frameless) {
                      close();
                      onClose();
                    } else {
                      onClose();
                    }
                  }}
                  title="Close"
                  aria-label="Close"
                  data-testid="v2-settings-close-btn"
                >
                  <X size={14} strokeWidth={2} />
                </ChromeButton>
              )}
            </div>
          </header>

          {panelModules.length > 0 && (
            <SettingsModuleMenubar
              modules={panelModules}
              activeId={activeId}
              onActiveIdChange={setActiveId}
              frameless={frameless}
            />
          )}

          {/*
            Accessible module-nav fallback + stable test hook.
            Visible module switcher is the grouped shadcn menubar above.
            This permanent visually-hidden nav keeps `v2-settings-nav-<id>`
            for screen readers and force-navigation e2e helpers.
           */}
          <nav
            aria-label="Modules (accessible navigation)"
            // Visually invisible but positioned inside the popout so
            // Playwright considers each item in-viewport and clickable.
            // `opacity: 0` keeps it out of sight; `pointer-events: auto` +
            // a non-zero hit area keep programmatic clicks working for
            // screen readers / e2e tests. The dropdown above remains the
            // visible UX for real users.
            className="absolute top-1 left-1 w-px h-px opacity-0 overflow-hidden pointer-events-auto whitespace-nowrap z-0"
            data-testid="v2-settings-nav"
          >
            {panelModules.map((m) => (
              <ChromeButton
                key={m.id}
                type="button"
                data-testid={`v2-settings-nav-${m.id}`}
                aria-selected={m.id === activeId}
                tabIndex={-1}
                onClick={() => setActiveId(m.id)}
                className="w-px h-px p-0 border-none bg-transparent"
              >
                {m.name}
              </ChromeButton>
            ))}
          </nav>

          {/* ── Body ───────────────────────────────────────────── */}
          <main
            className="ds-popout-body"
            data-layout={helpOpen ? 'help' : hasMasterDetail ? 'master-detail' : 'editor-only'}
          >
            {helpOpen ? (
              <HelpPanel />
            ) : (
              <>
            {hasMasterDetail && ListPane && activeModule && (
              <aside className="ds-popout-list" data-testid="v2-settings-list">
                {panelReady ? (
                  <ListPane
                    gridId={gridId}
                    selectedId={selectedId}
                    onSelect={(id) => setSelectedForModule(activeModule.id, id)}
                  />
                ) : null}
              </aside>
            )}

            <section
              className="ds-popout-editor"
              data-testid="v2-settings-content"
              data-active-module={activeModule?.id ?? ''}
            >
              {hasMasterDetail && EditorPane ? (
                // Module-specific testid wrapper — back-compat alias for the
                // legacy flat panel testids (`cs-panel` / `cg-panel` / `cc-panel`).
                // The wrapper is a flex column so the editor's `ds-editor-header`
                // + `ds-editor-scroll` children layout correctly (replaces the
                // previous `display: contents` hoist).
                <div
                  data-testid={PANEL_TESTID_BY_MODULE_ID[activeId] ?? ''}
                  className="flex flex-col flex-1 min-h-0 overflow-hidden"
                >
                  {panelReady ? <EditorPane gridId={gridId} selectedId={selectedId} /> : null}
                </div>
              ) : LegacyPanel ? (
                // Flat panels (e.g. Grid Options) own their scroll regions —
                // a wrapping `ds-editor-scroll` scrolls the whole panel and
                // drags the band sidebar along with the right-hand content.
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {panelReady ? <LegacyPanel gridId={gridId} /> : null}
                </div>
              ) : (
                <div className="p-6">
                  <div className="ds-caps text-[10px] mb-1.5">
                    NO EDITOR
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {activeModule?.name ?? 'This module'} has no settings UI registered.
                  </div>
                </div>
              )}
            </section>
              </>
            )}
          </main>

          {/* ── Footer ─────────────────────────────────────────── */}
          <footer className="ds-popout-footer">
            {/* Keyboard shortcut hints — the per-card Save pills on
                every editor already signal "save each rule
                individually", so the redundant copy line was dropped
                when the popout narrowed to 820px (it was pushing the
                Done button off-screen). */}
            <span className="whitespace-nowrap">
              ⌘ S = SAVE CARD · ⌘ ⏎ = SAVE ALL · ⌫ = DELETE · ESC = CLOSE
            </span>
            <span className="flex-1" />
            <SharpBtn
              variant="ghost"
              onClick={onClose}
              style={{ height: 26 }}
            >
              Discard
            </SharpBtn>
            <SharpBtn
              variant="action"
              onClick={onClose}
              style={{ height: 26 }}
              data-testid="v2-settings-done-btn"
            >
              Done
            </SharpBtn>
          </footer>
    </div>
    );
  };

  // ── Final render: shadcn Drawer (right rail) for inline mode;
  // Poppable still owns the optional OS-window pop-out + focusIfPopped.
  return (
    <Poppable
      ref={ref}
      name={`ds-popout-${gridId}`}
      title={`Grid Customizer — ${gridId}`}
      width={960}
      height={700}
      frame={false}
    >
      {({ popped, PopoutButton, close }) => {
        const sheet = buildSheet({ popped, PopoutButton, close });

        if (popped) {
          return (
            <div
              data-ds-settings=""
              data-testid="v2-settings-sheet"
              data-popped="true"
            >
              {sheet}
            </div>
          );
        }

        // The Drawer root stays mounted with a controlled `open` (vaul
        // animates the panel out on close and unmounts only the portal
        // content). Keeping THIS component mounted across opens preserves
        // sheet-local state (active module, per-module selection) and
        // skips re-running all the top-level hooks on every reopen.
        return (
          <Drawer
            open={open}
            onOpenChange={(next) => {
              if (!next) onClose();
            }}
            direction="right"
            shouldScaleBackground={false}
          >
            <DrawerContent
              hideHandle
              overlayTestId="v2-settings-overlay"
              className="ds-settings-drawer w-[min(820px,96vw)] border-l border-[color:var(--ds-border-secondary)] bg-[color:var(--ds-surface-ground)] p-0"
            >
              <DrawerTitle className="sr-only">Grid Customizer</DrawerTitle>
              <div
                data-ds-settings=""
                data-testid="v2-settings-sheet"
                className="flex h-full min-h-0 flex-col"
              >
                {sheet}
              </div>
            </DrawerContent>
          </Drawer>
        );
      }}
    </Poppable>
  );
});

