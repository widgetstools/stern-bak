/**
 * Two-grid dashboard — visual reference for a multi-grid layout.
 *
 * Two `<MarketsGrid>` instances sit side by side. Each has:
 *   - a unique `gridId` → independent profiles, independent platform,
 *     independent DirtyBus, independent toolbars.
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
import type { ColDef } from 'ag-grid-community';
import { MarketsGrid, type StorageAdapterFactory } from '@wellsfargo-starui/grid';

import { generateOrders, generateEquityOrders, type Order } from './data';
import { APP_ID, DEMO_USER_ID } from './App';

export interface DashboardProps {
  columnDefs: ColDef<Order>[];
  defaultColDef: ColDef<Order>;
  storage: StorageAdapterFactory;
}

export function Dashboard({ columnDefs, defaultColDef, storage }: DashboardProps) {
  const [ratesData] = useState(() => generateOrders(500));
  const [equityData] = useState(() => generateEquityOrders(300));

  // One storage factory, shared across both grids. The `MarketsGrid`
  // host calls the factory with the per-grid identity tuple so the two
  // grids end up with fully independent, instance-scoped adapters.
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
        storage={storage}
      />
      <GridPanel
        label="EQUITIES BLOTTER"
        gridId="dashboard-equities-v2"
        rowData={equityData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        storage={storage}
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
  storage: StorageAdapterFactory;
}

function GridPanel({
  label,
  gridId,
  rowData,
  columnDefs,
  defaultColDef,
  storage,
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
          rowIdField="id"
          storage={storage}
          appId={APP_ID}
          userId={DEMO_USER_ID}
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
