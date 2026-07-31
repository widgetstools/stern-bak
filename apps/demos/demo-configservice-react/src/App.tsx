import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ColDef, GridReadyEvent, GridApi } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { MarketsGrid, type AdminAction, type StorageAdapterFactory } from '@wellsfargo-starui/grid';
import { activeProfileKey } from '@wellsfargo-starui/engine';
import type { ProfileSnapshot } from '@wellsfargo-starui/engine';
import {
  createConfigManager,
  createConfigServiceStorage,
  type ConfigManager,
} from '@wellsfargo-starui/host-config';
// /config subpath avoids the @openfin/workspace-platform module-load
// that would otherwise throw in this plain-browser dev harness.
import {
  setConfigManager as publishSharedConfigManager,
  encodeHostEnvForQueryString,
} from '@wellsfargo-starui/openfin-platform/config';
import { createConfigBrowserAction } from '@wellsfargo-starui/config-browser';
import { Sun, Moon, User, Database } from 'lucide-react';
import { useStarGridApp } from '@wellsfargo-starui/app';
import { agGridDarkParams, agGridLightParams } from '@wellsfargo-starui/design-system/adapters/ag-grid';

import { generateOrders, startLiveTicking, type Order } from './data';
import { Dashboard } from './Dashboard';
import { MarketDepth } from './MarketDepth';
import { buildShowcasePayload, SHOWCASE_PROFILE_NAME } from './showcaseProfile';

// ─── ConfigService integration ─────────────────────────────────────────
//
// Both this demo and apps/demos/demo-react use the ConfigService-backed
// `createConfigServiceStorage` factory. This one adds a multi-user
// switcher in the header so you can flip between three demo users and
// watch each user's profile set come and go — proving that userId
// scoping works end-to-end. (apps/demos/demo-react is single-user and adds
// the fixture views the e2e suite drives.)
//
// Profiles are persisted as `AppConfigRow` rows scoped by
// `(appId, userId, instanceId)`.
//
// ConfigManager runs in pure-Dexie mode (no REST endpoint). All profile
// rows live in IndexedDB under the `marketsui-config` database; they
// survive reload and persist across browser sessions just like Dexie,
// but now MarketsGrid is decoupled from the storage medium and the
// same setup would transparently hit a REST backend in prod.

// Canonical identities used across the MarketsUI reference apps.
// `TestApp` is the app registered in every shipped seed-config.json;
// `dev1` is its default user with developer + admin role permissions.
// Alice / Bob are demo-only alternates kept alongside so the per-user
// scoping mechanism is visible even to first-time visitors — they
// have no seed rows, just MarketsGrid profile-set rows they create.
const APP_ID = 'TestApp';
const DEMO_USERS = [
  { id: 'dev1',  label: 'dev1' },
  { id: 'alice', label: 'Alice' },
  { id: 'bob',   label: 'Bob' },
] as const;
type DemoUserId = (typeof DEMO_USERS)[number]['id'];

const CURRENT_USER_LS_KEY = 'demo-cs-current-user';

function initialUser(): DemoUserId {
  try {
    const stored = localStorage.getItem(CURRENT_USER_LS_KEY);
    if (stored && DEMO_USERS.some((u) => u.id === stored)) return stored as DemoUserId;
  } catch { /* access denied */ }
  return 'dev1';
}

/** User-scoped active-profile key. Keeps Alice's "last open profile"
 *  from leaking into Bob's session on the same device. */
function scopedActiveProfileKey(gridId: string, userId: DemoUserId): string {
  return `${activeProfileKey(gridId)}:${userId}`;
}

type View = 'single' | 'dashboard' | 'depth';
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
  return 'single';
}

// ─── AG-Grid Themes ─────────────────────────────────────────────────────────
//
// Built from @wellsfargo-starui/design-system/adapters/ag-grid (reference-aligned
// Chroma Desk params) + app-specific tuning (mono font, smaller icons,
// tighter cell padding, sharp corners). Theme attribute on <html> drives
// the underlying --ds-* CSS vars; these params just point at them.

const sharedParamOverrides = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  headerFontSize: 10,
  iconSize: 10,
  cellHorizontalPaddingScale: 0.6,
  spacing: 6,
  borderRadius: 0,
  wrapperBorderRadius: 0,
  columnBorder: true,
};

const darkTheme  = themeQuartz.withParams({ ...agGridDarkParams,  ...sharedParamOverrides });
const lightTheme = themeQuartz.withParams({ ...agGridLightParams, ...sharedParamOverrides });

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

// ─── Showcase seeding ──────────────────────────────────────────────────
//
// On first boot (per gridId), seed the "Showcase" profile directly into
// the Dexie store and flip the active-profile localStorage pointer so
// MarketsGrid boots straight into the styled / calculated / tick-flashed
// view. Skipped on subsequent loads (idempotent: we match by name).

const GRID_ID = 'demo-blotter-v2';
// Seed flag is per-user so each demo user sees the showcase on first
// open — proves that profile data is user-scoped. Without this, Alice
// would seed the profile, Bob would switch in and find it already
// present (because we DO share the Dexie physical db), giving the
// false impression that Bob inherits Alice's profile.
function seedFlagKey(userId: DemoUserId): string {
  return `demo-cs-showcase-seeded:${GRID_ID}:${userId}`;
}

/**
 * First-boot seed of the "Showcase" profile for a user. Writes
 * through the same `storage` factory MarketsGrid uses, so the
 * resulting row is a real ConfigService `AppConfigRow` — you can
 * inspect it via the ConfigBrowser (once wired) to see the exact
 * `componentType: "markets-grid-profile"` / composite configId shape.
 */
async function ensureShowcaseSeedFor(
  userId: DemoUserId,
  storage: StorageAdapterFactory,
): Promise<void> {
  const flagKey = seedFlagKey(userId);
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(flagKey)) {
      return;
    }
  } catch { /* access denied — press on */ }

  // Seed via the same factory MarketsGrid uses — passes the full
  // identity triple so the row is correctly scoped to (TestApp, userId).
  const adapter = storage({ instanceId: GRID_ID, appId: APP_ID, userId });
  const existing = await adapter.listProfiles(GRID_ID);
  if (existing.some((p) => p.name.toLowerCase() === SHOWCASE_PROFILE_NAME.toLowerCase())) {
    try { localStorage.setItem(flagKey, '1'); } catch { /* */ }
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
  await adapter.saveProfile(snap);

  // Point the user-scoped active-profile pointer at the fresh snapshot
  // so the first MarketsGrid render for this user lands on the showcase.
  try { localStorage.setItem(scopedActiveProfileKey(GRID_ID, userId), id); } catch { /* */ }
  try { localStorage.setItem(flagKey, '1'); } catch { /* */ }
}

// ─── App ─────────────────────────────────────────────────────────────────────

export function App() {
  return <AppInner />;
}

function AppInner() {
  const [rowData] = useState(() => generateOrders(500));
  // Theme flows through the runtime's single state holder; `setTheme`
  // writes DOM + localStorage (`starui:theme`) + cross-window broadcast
  // in one call. The previous `gc-theme` key and manual setAttribute
  // are gone — both windows (App and ConfigBrowserPopout) read the
  // same canonical key.
  const { theme, setTheme } = useStarGridApp();
  const isDark = theme === 'dark';
  const [view, setView] = useState<View>(initialView);
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
  // Active user — flips the factory's closure, effectively replacing
  // every MarketsGrid's view of what profiles exist. Persisted so
  // reload keeps you as the same user.
  const [userId, setUserId] = useState<DemoUserId>(initialUser);
  // ConfigManager is created once per mount in dev (Dexie-only mode —
  // no REST endpoint means all data lives in IndexedDB). A real app
  // would pass `{ restUrl, apiKey }` here to push writes upstream.
  const [configManager, setConfigManager] = useState<ConfigManager | null>(null);
  const [cfgError, setCfgError] = useState<Error | null>(null);

  // Theme writes are owned by the runtime — see `setTheme` from
  // `useHost()` below. No local effect needed.

  // Reflect the view in the URL so reloads / shared links land in the
  // same mode. `replaceState` to avoid polluting browser history on
  // every toggle.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (view === 'dashboard') q.set('view', 'dashboard');
    else if (view === 'depth') q.set('view', 'depth');
    else q.delete('view');
    const next = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
    window.history.replaceState(null, '', next);
  }, [view]);

  const agTheme = isDark ? darkTheme : lightTheme;

  // Init ConfigManager once on mount. Mode is env-driven:
  //
  //   VITE_CONFIG_SERVICE_URL unset (or empty) → Dexie-only. All reads
  //     and writes hit IndexedDB. Default for local dev.
  //
  //   VITE_CONFIG_SERVICE_URL set → REST mode. Writes go to the REST
  //     backend first, then mirror to Dexie; reads still come from
  //     Dexie for speed. Failed writes queue in PENDING_SYNC and retry
  //     every 10s. See packages/config-service/src/ConfigManager.ts.
  //
  // `seedConfigUrl` points at public/seed-config.json which
  // ConfigManager fetches ONCE on first boot (Dexie tables empty) and
  // uses to populate appRegistry / userProfiles / roles / permissions.
  // Subsequent boots skip the fetch.
  //
  // Awaiting init gates the storage factory behind a loaded
  // configuration — MarketsGrid's first listProfiles call doesn't
  // race a half-initialized Dexie table.
  //
  // Also publish the instance to @wellsfargo-starui/openfin-platform's shared
  // singleton so `<ConfigBrowserPanel>` (which reads via
  // getConfigManager()) sees the same ConfigManager.
  useEffect(() => {
    let alive = true;
    const mgr = createConfigManager({
      // Resolved against the current origin — works under Vite's
      // `/` root, and a subpath deployment can override via BASE_URL.
      seedConfigUrl: new URL('seed-config.json', document.baseURI).toString(),
      // Empty string → undefined → Dexie-only mode.
      configServiceRestUrl: import.meta.env.VITE_CONFIG_SERVICE_URL || undefined,
    });
    mgr.init()
      .then(() => {
        if (!alive) return;
        publishSharedConfigManager(mgr); // share with ConfigBrowserPanel's hook
        setConfigManager(mgr); // local state for factory memoization
      })
      .catch((err) => { if (alive) setCfgError(err); });
    return () => {
      alive = false;
      mgr.dispose();
    };
  }, []);

  // Build the ConfigService-backed StorageAdapterFactory. Closes over
  // `configManager` only — `appId` and `userId` flow through MarketsGrid's
  // own props, so switching users is just a prop change (no factory
  // rebuild, no useMemo churn). Same factory reused across every grid
  // in the app.
  const storage = useMemo<StorageAdapterFactory | undefined>(() => {
    if (!configManager) return undefined;
    return createConfigServiceStorage({ configManager });
  }, [configManager]);

  // Persist the selected user across reloads.
  useEffect(() => {
    try { localStorage.setItem(CURRENT_USER_LS_KEY, userId); } catch { /* */ }
  }, [userId]);

  // Admin actions surfaced at the right edge of MarketsGrid's primary
  // toolbar row. One entry: launch the real @wellsfargo-starui/config-browser
  // in a popout browser window so the user can see the grid AND its
  // raw ConfigService rows side-by-side. Same-origin = Dexie is
  // shared → the popout sees writes from the main window on refresh.
  const adminActions = useMemo<AdminAction[]>(() => [
    createConfigBrowserAction({
      launch: () => {
        // Carry the demo's hostEnv via query string so ConfigBrowser's
        // readHostEnv() returns our appId (instead of the default
        // 'dev-host') and its queries filter to our rows.
        const env = encodeHostEnvForQueryString({
          appId: APP_ID,
          // Empty (Dexie-only) → 'local-dexie' marker so the popout's
          // ConfigBrowser knows it's same-origin Dexie. With a REST
          // backend configured, we pass the URL so the popout talks
          // to the same server as the main window.
          configServiceUrl: import.meta.env.VITE_CONFIG_SERVICE_URL || 'local-dexie',
        });
        const url = `${window.location.origin}${window.location.pathname}?configBrowser=1&hostEnv=${env}`;
        // Fixed window name = clicking the action a second time
        // focuses the existing popup instead of spawning a duplicate.
        const features = 'width=1280,height=800,resizable=yes,scrollbars=yes';
        const w = window.open(url, 'marketsui-config-browser', features);
        if (w && !w.closed) w.focus();
      },
    }),
  ], []);

  // One-shot seed of the Showcase profile per user. Seeds via the same
  // ConfigService factory MarketsGrid uses — the resulting row is a
  // real AppConfigRow you can inspect through the Config Browser.
  useEffect(() => {
    if (!storage) return;
    let alive = true;
    setSeeded(false);
    ensureShowcaseSeedFor(userId, storage).finally(() => {
      if (alive) setSeeded(true);
    });
    return () => { alive = false; };
  }, [storage, userId]);

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
        borderBottom: '1px solid color-mix(in srgb, var(--ds-border-primary) 82%, var(--ds-primary) 18%)',
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--ds-surface-primary) 92%, var(--ds-surface-secondary)) 0%, var(--ds-surface-primary) 100%)',
        boxShadow: '0 1px 0 rgba(255, 255, 255, 0.86) inset, 0 1px 2px rgba(15, 23, 42, 0.05)',
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
            <button
              onClick={() => setTicking((t) => !t)}
              data-testid="tick-toggle"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 26, padding: '0 10px', borderRadius: 5,
              border: '1px solid var(--ds-border-primary)',
                background: ticking
                  ? 'color-mix(in srgb, var(--ds-accent-positive) 14%, transparent)'
                : 'var(--ds-surface-secondary)',
              color: ticking ? 'var(--ds-accent-positive)' : 'var(--ds-text-muted)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontFamily: 'var(--ds-font-sans)',
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
              title={ticking ? 'Pause live ticking' : 'Resume live ticking'}
            >
              <span
                style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: ticking ? 'var(--ds-accent-positive)' : 'var(--ds-text-muted)',
                  boxShadow: ticking ? '0 0 8px var(--ds-accent-positive)' : 'none',
                  animation: ticking ? 'gcTickPulse 1.4s ease-in-out infinite' : undefined,
                }}
              />
              {ticking ? 'LIVE' : 'PAUSED'}
            </button>
          )}
          {/* ConfigService indicator — visual proof that profiles are
              being persisted through the factory, not a direct adapter. */}
          <span
            title="Profiles persist via @wellsfargo-starui/host-config — scoped by (appId, userId, instanceId)"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 26, padding: '0 10px', borderRadius: 5,
              border: '1px solid var(--ds-border-primary)',
              background: 'var(--ds-surface-secondary)',
              color: 'var(--ds-text-muted)',
              fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: 'var(--ds-font-sans)',
            }}
          >
            <Database size={11} strokeWidth={2} />
            ConfigService
          </span>

          {/* User switcher — flips the factory closure so profiles
              scope to a different userId. Effectively replaces every
              grid's profile set without unmounting. */}
          <div
            title="Active user. Profiles are scoped per-user; switching reveals a different profile set."
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              height: 26, padding: '0 4px 0 10px', borderRadius: 5,
              border: '1px solid var(--ds-border-primary)',
              background: 'var(--ds-surface-secondary)',
              color: 'var(--ds-text-primary)',
            }}
            data-testid="user-switcher"
          >
            <User size={11} strokeWidth={2} style={{ color: 'var(--ds-text-muted)' }} />
            {DEMO_USERS.map((u) => (
              <button
                key={u.id}
                onClick={() => setUserId(u.id)}
                data-testid={`user-tab-${u.id}`}
                data-active={userId === u.id ? 'true' : 'false'}
                style={{
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--ds-font-sans)',
                  borderRadius: 3,
                  border: '1px solid transparent',
                  color: userId === u.id ? 'var(--ds-primary)' : 'var(--ds-text-muted)',
                  background: userId === u.id
                    ? 'var(--ds-primary-soft)'
                    : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 120ms',
                }}
              >
                {u.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 5,
              border: '1px solid var(--ds-border-primary)',
              background: 'var(--ds-surface-secondary)',
              color: 'var(--ds-text-primary)',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={13} strokeWidth={1.75} /> : <Moon size={13} strokeWidth={1.75} />}
          </button>
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

      {cfgError ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
          color: 'var(--ds-accent-negative)', fontSize: 12,
          fontFamily: 'var(--ds-font-sans)',
        }}>
          <div style={{ fontWeight: 600 }}>ConfigService init failed</div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{cfgError.message}</div>
        </div>
      ) : !configManager || !seeded ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted-foreground)', fontSize: 11,
          fontFamily: 'var(--ds-font-sans)', letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          {!configManager ? 'Initializing ConfigService…' : `Loading showcase for ${userId}…`}
        </div>
      ) : view === 'single' ? (
        <div style={{ flex: 1 }}>
          <MarketsGrid
            gridId="demo-blotter-v2"
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            theme={agTheme}
            rowIdField="id"
            storage={storage}
            appId={APP_ID}
            userId={userId}
            adminActions={adminActions}
            showFiltersToolbar
            showFormattingToolbar
            showEditingToolbar
            onGridReady={handleGridReady}
            sideBar={{ toolPanels: ['columns', 'filters'] }}
            statusBar={{
              statusPanels: [
                { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
                { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
              ],
            }}
          />
        </div>
      ) : view === 'dashboard' ? (
        <Dashboard
          theme={agTheme}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          storage={storage}
          appId={APP_ID}
          userId={userId}
          adminActions={adminActions}
        />
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
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      style={{
        padding: '4px 10px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontFamily: 'var(--ds-font-sans)',
        borderRadius: 4,
        border: '1px solid',
        borderColor: active ? 'var(--ds-primary-ring)' : 'var(--ds-border-primary)',
        color: active ? 'var(--ds-primary)' : 'var(--ds-text-muted)',
        background: active ? 'var(--ds-primary-soft)' : 'var(--ds-surface-secondary)',
        cursor: 'pointer',
        transition: 'all 120ms',
      }}
    >
      {children}
    </button>
  );
}
