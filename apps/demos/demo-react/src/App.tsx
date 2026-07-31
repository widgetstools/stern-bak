import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ColDef, GridReadyEvent, GridApi } from 'ag-grid-community';
import { MarketsGrid, type StorageAdapterFactory } from '@wellsfargo-starui/grid';
import { activeProfileKey } from '@wellsfargo-starui/engine';
import type { ProfileSnapshot } from '@wellsfargo-starui/engine';
import { Sun, Moon } from 'lucide-react';
import { Button, cn } from '@wellsfargo-starui/ui';
import { useStarGridApp } from '@wellsfargo-starui/app';
import { ProfileSetVersionConflictError } from '@wellsfargo-starui/host-config';

import { generateOrders, startLiveTicking, type Order } from './data';
import { Dashboard } from './Dashboard';
import { MarketDepth } from './MarketDepth';
import { DesignSystem } from './DesignSystem';
import { buildShowcasePayload, SHOWCASE_PROFILE_NAME } from './showcaseProfile';
import { Fixture } from './Fixture';
import { FIXTURES, isFixtureName, type FixtureName } from './nestedFixtures';

/** App identity used by main.tsx (runtime) and by the storage factory.
 *  Exported so the entry file can mirror them onto BrowserRuntime's
 *  identity option — keeps the (appId, userId, instanceId) tuple in
 *  one place. */
export const APP_ID = 'demo-react';
export const DEMO_USER_ID = 'demo-user';

type View = 'single' | 'dashboard' | 'depth' | 'fixture' | 'design-system';
const LIVE_TICK_INTERVAL_MS = 300;

/**
 * Initial view comes from `?view=...` (falls back to single).
 * Captured ONCE on mount so a runtime toggle doesn't round-trip the
 * URL — the header button updates both state AND the URL in place via
 * `history.replaceState`.
 */
function initialView(): View {
  if (typeof window === 'undefined') return 'single';
  const q = new URLSearchParams(window.location.search);
  const v = q.get('view');
  if (v === 'dashboard') return 'dashboard';
  if (v === 'depth') return 'depth';
  if (v === 'fixture') return 'fixture';
  if (v === 'design-system') return 'design-system';
  return 'single';
}

/** Fixture name from `?f=<name>`. Only valid when view === 'fixture'. */
function initialFixtureName(): FixtureName | null {
  if (typeof window === 'undefined') return null;
  const f = new URLSearchParams(window.location.search).get('f');
  return isFixtureName(f) ? f : null;
}

// ─── Column Definitions (plain — no renderers, no formatters, no styles) ─────

const columnDefs: ColDef<Order>[] = [
  { field: 'id', headerName: 'Order ID', initialWidth: 120, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'time', headerName: 'Time', initialWidth: 100, filter: 'agTextColumnFilter' },
  { field: 'security', headerName: 'Security', initialWidth: 180, filter: 'agTextColumnFilter' },
  { field: 'side', headerName: 'Side', initialWidth: 70, filter: 'agSetColumnFilter' },
  { field: 'quantity', headerName: 'Qty', initialWidth: 100, filter: 'agNumberColumnFilter' },
  {
    field: 'price',
    headerName: 'Price',
    initialWidth: 100,
    filter: 'agNumberColumnFilter',
    editable: true,
    cellEditor: 'agNumberCellEditor',
    cellEditorParams: { min: 0, precision: 4 },
    cellDataType: 'number',
  },
  { field: 'yield', headerName: 'Yield', initialWidth: 90, filter: 'agNumberColumnFilter' },
  { field: 'spread', headerName: 'Spread', initialWidth: 90, filter: 'agNumberColumnFilter' },
  { field: 'filled', headerName: 'Filled', initialWidth: 90, filter: 'agNumberColumnFilter' },
  { field: 'status', headerName: 'Status', initialWidth: 100, filter: 'agSetColumnFilter' },
  { field: 'venue', headerName: 'Venue', initialWidth: 120, filter: 'agSetColumnFilter' },
  { field: 'counterparty', headerName: 'Counterparty', initialWidth: 140, filter: 'agSetColumnFilter' },
  { field: 'account', headerName: 'Account', initialWidth: 110, filter: 'agSetColumnFilter' },
  { field: 'desk', headerName: 'Desk', initialWidth: 90, filter: 'agSetColumnFilter' },
  { field: 'trader', headerName: 'Trader', initialWidth: 110, filter: 'agSetColumnFilter' },
  { field: 'notional', headerName: 'Notional', initialWidth: 120, filter: 'agNumberColumnFilter' },
  { field: 'currency', headerName: 'CCY', initialWidth: 70, filter: 'agSetColumnFilter' },
  { field: 'settlementDate', headerName: 'Settle Date', initialWidth: 110, filter: 'agTextColumnFilter' },
];

// Every column gets a floating filter by default; columns set their specific
// filter type (text/number/set) on the column def itself.
const defaultColDef: ColDef<Order> = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

/** Stable AG-Grid chrome refs — inline literals on every App render defeat MarketsGridSurface memo. */
const DEMO_BLOTTER_SIDE_BAR = { toolPanels: ['columns', 'filters'] };
const DEMO_BLOTTER_STATUS_BAR = {
  statusPanels: [
    { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' as const },
    { statusPanel: 'agSelectedRowCountComponent', align: 'left' as const },
  ],
};

// ─── Showcase seeding ──────────────────────────────────────────────────
//
// On first boot (per gridId), seed the "Showcase" profile through the
// same storage factory MarketsGrid uses and flip the active-profile
// localStorage pointer so MarketsGrid boots straight into the styled /
// calculated / tick-flashed view. Skipped on subsequent loads
// (idempotent: we match by name).

export const GRID_ID = 'demo-blotter-v2';
const SEEDED_FLAG_KEY = `gc-showcase-seeded:${GRID_ID}`;

/** StrictMode-safe: one in-flight seed per page session. */
let showcaseSeedPromise: Promise<void> | null = null;

function hasShowcaseProfile(
  profiles: ReadonlyArray<{ name: string }>,
): boolean {
  return profiles.some((p) => p.name.toLowerCase() === SHOWCASE_PROFILE_NAME.toLowerCase());
}

async function ensureShowcaseSeed(storage: StorageAdapterFactory): Promise<void> {
  if (showcaseSeedPromise) return showcaseSeedPromise;

  showcaseSeedPromise = (async () => {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(SEEDED_FLAG_KEY)) {
        return;
      }

      const adapter = storage({ instanceId: GRID_ID, appId: APP_ID, userId: DEMO_USER_ID });
      const existing = await adapter.listProfiles(GRID_ID);
      if (hasShowcaseProfile(existing)) {
        try { localStorage.setItem(SEEDED_FLAG_KEY, '1'); } catch { /* */ }
        return;
      }

      const payload = buildShowcasePayload(GRID_ID);
      const now = Date.now();
      const id = 'showcase';
      const snap: ProfileSnapshot = {
        id,
        gridId: GRID_ID,
        name: payload.profile.name,
        state: payload.profile.state,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await adapter.saveProfile(snap);
      } catch (err) {
        // Migration or a parallel StrictMode seed may have won the write.
        if (err instanceof ProfileSetVersionConflictError) {
          const latest = await adapter.listProfiles(GRID_ID);
          if (!hasShowcaseProfile(latest)) throw err;
        } else {
          throw err;
        }
      }

      try { localStorage.setItem(activeProfileKey(GRID_ID), id); } catch { /* */ }
      try { localStorage.setItem(SEEDED_FLAG_KEY, '1'); } catch { /* */ }
    } catch (err) {
      showcaseSeedPromise = null;
      throw err;
    }
  })();

  return showcaseSeedPromise;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export function App() {
  const { theme, setTheme, storageFactory } = useStarGridApp();

  if (!storageFactory) {
    return (
      <div
        data-testid="storage-loading"
        style={{
          height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted-foreground)', fontSize: 11,
          fontFamily: 'var(--ds-font-sans)', letterSpacing: '0.08em',
          textTransform: 'uppercase',
          background: 'var(--ds-surface-ground)',
        }}
      >
        Initializing storage…
      </div>
    );
  }

  return <AppInner storage={storageFactory} theme={theme} setTheme={setTheme} />;
}

function AppInner({
  storage,
  theme,
  setTheme,
}: {
  storage: StorageAdapterFactory;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
}) {
  const [rowData] = useState(() => generateOrders(500));
  const isDark = theme === 'dark';
  const [view, setView] = useState<View>(initialView);
  const [fixtureName] = useState<FixtureName | null>(initialFixtureName);
  // Grid API captured via onGridReady — used to stream tick updates
  // through applyTransactionAsync without replacing rowData.
  const gridApiRef = useRef<GridApi<Order> | null>(null);
  // Live-tick toggle in the header. Defaults on — that's the whole
  // point of the showcase, but users debugging render issues can pause
  // it. Persisted so a reload keeps the user's choice.
  const [ticking, setTicking] = useState(() => {
    try { return localStorage.getItem('gc-ticking') !== 'off'; }
    catch { return true; }
  });
  // Gate the first render until the showcase profile has been seeded;
  // otherwise MarketsGrid briefly boots with the default profile and
  // then flips, producing a visible style flash.
  const [seeded, setSeeded] = useState(false);

  // Reflect the view in the URL so reloads / shared links land in the
  // same mode. `replaceState` to avoid polluting browser history on
  // every toggle.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (view === 'dashboard') q.set('view', 'dashboard');
    else if (view === 'depth') q.set('view', 'depth');
    else if (view === 'fixture') q.set('view', 'fixture');
    else if (view === 'design-system') q.set('view', 'design-system');
    else q.delete('view');
    const next = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
    window.history.replaceState(null, '', next);
  }, [view]);

  // One-shot seed on mount. `ensureShowcaseSeed` is idempotent — it
  // short-circuits on the per-grid flag or when the profile already
  // exists in the bundled row — so React 19 StrictMode double-mount is safe.
  useEffect(() => {
    let alive = true;
    void ensureShowcaseSeed(storage)
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[demo-react] showcase seed failed:', err);
      })
      .finally(() => {
        if (alive) setSeeded(true);
      });
    return () => { alive = false; };
  }, [storage]);

  // Persist the tick-toggle preference.
  useEffect(() => {
    try { localStorage.setItem('gc-ticking', ticking ? 'on' : 'off'); }
    catch { /* */ }
  }, [ticking]);

  // Live ticking — start once the grid is ready + ticking is on. Emits
  // row updates through the transaction API so AG-Grid only repaints
  // the dirty cells (conditional styling's flash rule picks up the
  // cellValueChanged event and fires the pulse).
  useEffect(() => {
    if (!ticking || view !== 'single') return;
    const stop = startLiveTicking(rowData, (updates) => {
      const api = gridApiRef.current;
      if (!api) return;
      try { api.applyTransactionAsync({ update: updates }); }
      catch { /* grid tearing down — drop the batch */ }
    }, LIVE_TICK_INTERVAL_MS, {
      mutationsPerTick: 10,
      minRowUpdateIntervalMs: 500,
    });
    return stop;
  }, [ticking, view, rowData]);

  const handleGridReady = useCallback((ev: GridReadyEvent<Order>) => {
    gridApiRef.current = ev.api;
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--ds-surface-ground)' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--ds-border-primary)',
        background: 'var(--ds-surface-primary)',
        gap: 12,
      }}>
        {/* View switcher — Single Grid vs Dashboard. Pins the demo to
            one of the two reference layouts that the e2e suites cover. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} data-testid="view-switcher">
          <ViewTab active={view === 'single'} onClick={() => setView('single')} testId="view-tab-single">
            Single grid
          </ViewTab>
          <ViewTab active={view === 'dashboard'} onClick={() => setView('dashboard')} testId="view-tab-dashboard">
            Two-grid dashboard
          </ViewTab>
          <ViewTab active={view === 'depth'} onClick={() => setView('depth')} testId="view-tab-depth">
            Market depth
          </ViewTab>
          <ViewTab active={view === 'design-system'} onClick={() => setView('design-system')} testId="view-tab-design-system">
            Design system
          </ViewTab>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {view === 'single' && (
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              {rowData.length} orders
            </span>
          )}
          {/* Live-tick toggle — pulse dot when ticking is on, static
              dot when paused. Placed next to the row-count so users
              immediately see the "live" state of the showcase. */}
          {view === 'single' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTicking((t) => !t)}
              data-testid="tick-toggle"
              data-live={ticking ? 'true' : 'false'}
              title={ticking ? 'Pause live ticking' : 'Resume live ticking'}
              className={cn(
                'h-[26px] gap-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.08em]',
                'transition-colors',
                ticking
                  ? 'border-border bg-[color-mix(in_srgb,var(--ds-accent-positive)_14%,transparent)] text-[color:var(--ds-accent-positive)] hover:bg-[color-mix(in_srgb,var(--ds-accent-positive)_22%,transparent)]'
                  : 'border-border bg-secondary text-muted-foreground hover:bg-secondary/80',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full transition-shadow',
                  ticking
                    ? 'bg-[color:var(--ds-accent-positive)] shadow-[0_0_8px_var(--ds-accent-positive)] animate-[gcTickPulse_1.4s_ease-in-out_infinite]'
                    : 'bg-muted-foreground',
                )}
              />
              {ticking ? 'LIVE' : 'PAUSED'}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="h-[26px] w-[26px]"
          >
            {isDark ? <Sun size={13} strokeWidth={1.75} /> : <Moon size={13} strokeWidth={1.75} />}
          </Button>
        </div>
      </header>

      {/* Pulse keyframes for the LIVE dot. Inlined here so the demo is
          self-contained (globals.css is scoped to grid-customizer
          tokens). */}
      <style>{`
        @keyframes gcTickPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(1.35); }
        }
      `}</style>

      {!seeded ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted-foreground)', fontSize: 11,
          fontFamily: 'var(--ds-font-sans)', letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Loading showcase…
        </div>
      ) : view === 'design-system' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <DesignSystem />
        </div>
      ) : view === 'fixture' && fixtureName ? (
        <Fixture
          fixture={FIXTURES[fixtureName]}
          storage={storage}
        />
      ) : view === 'fixture' ? (
        <div
          data-testid="fixture-missing"
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted-foreground)', fontSize: 11,
          }}
        >
          Pass <code>?view=fixture&amp;f=&lt;name&gt;</code> with one of:&nbsp;
          {Object.keys(FIXTURES).join(', ')}.
        </div>
      ) : view === 'single' ? (
        <div style={{ flex: 1 }}>
          <MarketsGrid
            gridId="demo-blotter-v2"
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowIdField="id"
            storage={storage}
            appId={APP_ID}
            userId={DEMO_USER_ID}
            showFiltersToolbar
            showFormattingToolbar
            showEditingToolbar
            onGridReady={handleGridReady}
            sideBar={DEMO_BLOTTER_SIDE_BAR}
            statusBar={DEMO_BLOTTER_STATUS_BAR}
          />
        </div>
      ) : view === 'dashboard' ? (
        <Dashboard columnDefs={columnDefs} defaultColDef={defaultColDef} storage={storage} />
      ) : (
        <MarketDepth isDark={isDark} />
      )}
    </div>
  );
}

function ViewTab({
  children,
  active,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      onClick={onClick}
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      className={cn(
        'h-[26px] rounded px-2.5 text-[10px] font-bold uppercase tracking-[0.08em]',
        'transition-colors',
        active
          ? 'border border-[color:var(--ds-primary-ring)] bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)] hover:bg-[color:var(--ds-primary-soft)]'
          : 'border border-border bg-secondary text-muted-foreground hover:bg-accent',
      )}
    >
      {children}
    </Button>
  );
}
