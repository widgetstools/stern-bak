/**
 * @vitest-environment jsdom
 */
import React, { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../customizer/hooks/GridProvider.js';
import { summaryPanelModule, SUMMARY_PANEL_MODULE_ID, type SummaryPanelState } from '../customizer/modules/summary-panel/index.js';
import { BlotterDock } from './BlotterDock.js';

vi.mock('ag-grid-react', () => ({
  AgGridReact: React.forwardRef<unknown, unknown>(() => <div data-testid="ag-grid-stub" />),
}));

function makeApi(rows: Record<string, unknown>[]): GridApi {
  return {
    forEachNode: (cb: (node: { data: Record<string, unknown> }) => void) => {
      rows.forEach((data) => cb({ data }));
    },
  } as unknown as GridApi;
}

function Harness({ title }: { title?: string }) {
  const gridRef = useRef(null);
  return (
    <BlotterDock
      title={title}
      gridRef={gridRef}
      gridOptions={{}}
      hostOverrideKeys={new Set()}
      theme="dark"
      rowData={[]}
      columnDefs={[]}
      onGridReady={() => {}}
      onGridPreDestroyed={() => {}}
    />
  );
}

function setup(rows: Record<string, unknown>[] = [], widgets: SummaryPanelState['widgets'] = [], title?: string) {
  const platform = new GridPlatform({ gridId: 'blotter-dock-test', modules: [summaryPanelModule] });
  platform.store.setModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID, () => ({ widgets }));
  const utils = render(
    <GridProvider platform={platform}>
      <Harness title={title} />
    </GridProvider>,
  );
  act(() => platform.onGridReady(makeApi(rows)));
  return { ...utils, platform };
}

/** The blotter is the only group that ever collapses in these tests (widget
 *  groups always start visible), so any collapsed group found here is it. */
function isCollapsed(container: HTMLElement): boolean {
  return container.querySelector('.dock-tab-group[data-header-collapsed]') !== null;
}

describe('BlotterDock', () => {
  it('renders the grid surface as dock-panel content', () => {
    setup();
    expect(screen.getByTestId('ag-grid-stub')).toBeTruthy();
  });

  // With no widgets the blotter's header starts collapsed (see below), so
  // its title isn't a visible `role="tab"` yet — the library still exposes
  // it as the group's own accessible name (`role="region"`, `aria-label`)
  // for assistive tech. The tab-with-that-title case is covered by "shows
  // the blotter's header once a summary widget exists" further down.
  it("carries the given title as the blotter panel's accessible name", () => {
    setup([], [], 'FI Blotter');
    expect(screen.getByRole('region', { name: 'FI Blotter' })).toBeTruthy();
  });

  it('falls back to a generic label when no title is given', () => {
    setup();
    expect(screen.getByRole('region', { name: 'Grid' })).toBeTruthy();
  });

  it("collapses the blotter's own header when there are no summary widgets", () => {
    const { container } = setup([], []);
    expect(isCollapsed(container)).toBe(true);
  });

  it("shows the blotter's own header (now a real tab, not just an aria-label) once a summary widget exists", () => {
    const { container } = setup(
      [{ sector: 'Tech', marketValue: 100 }],
      [{ id: 'w1', title: 'Sector digest', kind: 'digest', query: { groupBy: ['sector'] } }],
      'FI Blotter',
    );
    expect(isCollapsed(container)).toBe(false);
    expect(screen.getByRole('tab', { name: 'FI Blotter' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Sector digest' })).toBeTruthy();
  });

  it('adding a widget after mount does not remount the grid surface', () => {
    const { container, platform } = setup([{ sector: 'Tech', marketValue: 100 }], []);
    const before = screen.getByTestId('ag-grid-stub');

    act(() => {
      platform.store.setModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID, () => ({
        widgets: [{ id: 'w1', title: 'Sector digest', kind: 'digest', query: { groupBy: ['sector'] } }],
      }));
    });

    expect(screen.getByRole('tab', { name: 'Sector digest' })).toBeTruthy();
    const after = container.querySelector('[data-testid="ag-grid-stub"]');
    expect(after).toBe(before);
    expect(isCollapsed(container)).toBe(false);
  });

  it('removing the last widget re-collapses the header and preserves the grid', () => {
    const { container, platform } = setup(
      [{ sector: 'Tech', marketValue: 100 }],
      [{ id: 'w1', title: 'Sector digest', kind: 'digest', query: { groupBy: ['sector'] } }],
    );
    const before = screen.getByTestId('ag-grid-stub');

    act(() => {
      platform.store.setModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID, () => ({ widgets: [] }));
    });

    expect(screen.queryByRole('tab', { name: 'Sector digest' })).toBeNull();
    expect(container.querySelector('[data-testid="ag-grid-stub"]')).toBe(before);
    expect(isCollapsed(container)).toBe(true);
  });

  it('closing a widget from its own dock header removes it from module state', () => {
    const { platform } = setup(
      [{ sector: 'Tech', marketValue: 100 }],
      [{ id: 'w1', title: 'Sector digest', kind: 'digest', query: { groupBy: ['sector'] } }],
    );

    // The dock's close action is wired to `mousedown` (button === 0), not `click`.
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Close Sector digest' }), { button: 0 });

    const state = platform.store.getModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID);
    expect(state.widgets).toHaveLength(0);
  });

  it('two widgets both dock and render side by side, and the grid keeps its own identity throughout', () => {
    const { container, platform } = setup([{ sector: 'Tech', marketValue: 100 }], []);
    const before = screen.getByTestId('ag-grid-stub');

    act(() => {
      platform.store.setModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID, () => ({
        widgets: [
          { id: 'w1', title: 'Sector digest', kind: 'digest', query: { groupBy: ['sector'] } },
          { id: 'w2', title: 'Sector heatmap', kind: 'heatmap', query: { columns: ['sector', 'marketValue'] } },
        ],
      }));
    });

    expect(screen.getByRole('tab', { name: 'Sector digest' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Sector heatmap' })).toBeTruthy();
    expect(container.querySelector('[data-testid="ag-grid-stub"]')).toBe(before);
  });
});
