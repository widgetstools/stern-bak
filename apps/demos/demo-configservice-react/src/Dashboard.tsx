/**
 * Two-grid dashboard — visual reference for a multi-grid layout.
 *
 * Two `<MarketsGrid>` instances sit side by side. Each has:
 *   - a unique `gridId` → independent IndexedDB profiles, independent
 *     platform, independent DirtyBus, independent toolbars.
 *   - its own rowData + chrome label so users can see at a glance which
 *     dataset they're looking at.
 *   - the full feature set (filters toolbar, formatting toolbar,
 *     settings sheet, profile selector).
 *
 * Why this exists: the FormattingToolbar refactor (steps 1-7) made every
 * toolbar fully context-driven — no prop-threaded store, no shared
 * references between grids. This page is the visual proof. Formatting
 * column `price` as bold+red on grid A leaves grid B untouched; grid B
 * can have its own saved templates, its own profile, its own overrides.
 *
 * This is also the harness the end-to-end isolation spec targets
 * (`e2e/v2-two-grid-isolation.spec.ts`).
 */
import { useState } from 'react';
import type { ColDef, Theme } from 'ag-grid-community';
import {
  MarketsGrid,
  type AdminAction,
  type StorageAdapterFactory,
} from '@wellsfargo-starui/grid';

import { generateOrders, generateEquityOrders, type Order } from './data';

export interface DashboardProps {
  theme: Theme;
  columnDefs: ColDef<Order>[];
  defaultColDef: ColDef<Order>;
  /** ConfigService-backed StorageAdapterFactory from the App shell.
   *  Both grids receive the same factory; each resolves its own
   *  `effectiveInstanceId = gridId`, producing per-instance adapters
   *  that write to independent ConfigService rows but share the
   *  (appId, userId) scope supplied via props below. */
  storage: StorageAdapterFactory | undefined;
  /** App identity. Propagated to both grids; required by the
   *  ConfigService-backed storage factory. */
  appId: string;
  /** User identity. Same treatment — both grids see the current user. */
  userId: string;
  /** Admin actions propagated to both grids. */
  adminActions: AdminAction[];
}

export function Dashboard({
  theme, columnDefs, defaultColDef, storage, appId, userId, adminActions,
}: DashboardProps) {
  const [ratesData] = useState(() => generateOrders(500));
  const [equityData] = useState(() => generateEquityOrders(300));

  return (
    <div
      data-testid="two-grid-dashboard"
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 1,
        background: 'var(--border)',
        minHeight: 0,
      }}
    >
      <GridPanel
        label="RATES BLOTTER"
        gridId="dashboard-rates-v2"
        rowData={ratesData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={theme}
        storage={storage}
        appId={appId}
        userId={userId}
        adminActions={adminActions}
      />
      <GridPanel
        label="EQUITIES BLOTTER"
        gridId="dashboard-equities-v2"
        rowData={equityData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={theme}
        storage={storage}
        appId={appId}
        userId={userId}
        adminActions={adminActions}
      />
    </div>
  );
}

interface GridPanelProps {
  label: string;
  gridId: string;
  rowData: Order[];
  columnDefs: ColDef<Order>[];
  defaultColDef: ColDef<Order>;
  theme: Theme;
  storage: StorageAdapterFactory | undefined;
  appId: string;
  userId: string;
  adminActions: AdminAction[];
}

function GridPanel({
  label,
  gridId,
  rowData,
  columnDefs,
  defaultColDef,
  theme,
  storage,
  appId,
  userId,
  adminActions,
}: GridPanelProps) {
  return (
    <section
      data-testid={`dashboard-panel-${gridId}`}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--ds-surface-ground)' }}
    >
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--ds-border-primary)',
          background: 'var(--ds-surface-primary)',
          boxShadow: '0 1px 0 rgba(255, 255, 255, 0.82) inset',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: 'var(--ds-accent-positive)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ds-text-primary)',
            fontFamily: 'var(--ds-font-sans)',
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--ds-text-muted)' }}>
          · {rowData.length} rows · {gridId}
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MarketsGrid
          gridId={gridId}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          theme={theme}
          rowIdField="id"
          storage={storage}
          appId={appId}
          userId={userId}
          adminActions={adminActions}
          showFiltersToolbar
          showFormattingToolbar
          showEditingToolbar
          sideBar={{ toolPanels: ['columns', 'filters'] }}
          statusBar={{
            statusPanels: [
              { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
              { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
            ],
          }}
        />
      </div>
    </section>
  );
}
