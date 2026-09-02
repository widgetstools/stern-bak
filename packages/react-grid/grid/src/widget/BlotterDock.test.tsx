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

  /**
   * The summary panel is ONE sidebar with the widgets as tabs, not a row of
   * panels above the grid.
   *
   * A horizontal strip took height from the blotter — the thing people are
   * actually reading — and every widget added shrank the others, so four
   * widgets meant four unreadable slivers. As tabs, a fifth widget costs
   * nothing in layout and each gets the sidebar's full height when selected.
   */
  it('gathers every widget into a single sidebar group rather than one panel each', () => {
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

    const groups = [...container.querySelectorAll('.dock-tab-group')];
    const tabsOf = (g: Element) => [...g.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    // The blotter's own group, and the summary sidebar. Nothing else.
    expect(groups).toHaveLength(2);
    expect(tabsOf(groups[1])).toEqual(['Sector digest', 'Sector heatmap']);
    expect(container.querySelector('[data-testid="ag-grid-stub"]')).toBe(before);
  });

  /** Right of the blotter, not above it: in a horizontal split the sidebar is
   *  the second child, so it follows the grid in document order. */
  it('places the sidebar after the blotter, so it sits to its right', () => {
    const { container } = setup(
      [{ sector: 'Tech', marketValue: 100 }],
      [{ id: 'w1', title: 'Sector digest', kind: 'digest', query: { groupBy: ['sector'] } }],
      'FI Blotter',
    );
    const groups = [...container.querySelectorAll('.dock-tab-group')];
    const tabsOf = (g: Element) => [...g.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(tabsOf(groups[0])).toContain('FI Blotter');
    expect(tabsOf(groups[1])).toContain('Sector digest');
  });

  /** Adding a fifth widget must join the existing tabs, not split the layout
   *  again — that is the whole point of the sidebar. */
  it('adds a later widget as another tab in the same sidebar', () => {
    const { container, platform } = setup(
      [{ sector: 'Tech', marketValue: 100 }],
      [{ id: 'w1', title: 'One', kind: 'digest', query: { groupBy: ['sector'] } }],
    );

    act(() => {
      platform.store.setModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID, () => ({
        widgets: [
          { id: 'w1', title: 'One', kind: 'digest', query: { groupBy: ['sector'] } },
          { id: 'w2', title: 'Two', kind: 'digest', query: { groupBy: ['sector'] } },
          { id: 'w3', title: 'Three', kind: 'digest', query: { groupBy: ['sector'] } },
        ],
      }));
    });

    const groups = [...container.querySelectorAll('.dock-tab-group')];
    expect(groups).toHaveLength(2);
    expect([...groups[1].querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual([
      'One',
      'Two',
      'Three',
    ]);
  });

  /** Maximize is the one panel action the blotter allows — the way back to a
   *  full-size grid once summary widgets are sharing the space. The button
   *  lives on the blotter's own header, which is collapsed (the library sets
   *  `display: none` on it) until a widget exists — so "is it reachable?" is
   *  a question about that header, not about the button's DOM presence. */
  function blotterMaximizeButton(container: HTMLElement): HTMLElement | null {
    return container.querySelector('[data-action="maximize"][data-panel-id="blotter"]');
  }

  it("offers a reachable maximize button on the blotter's header while summary widgets are visible", () => {
    const { container } = setup(
      [{ sector: 'Tech', marketValue: 100 }],
      [{ id: 'w1', title: 'Sector digest', kind: 'digest', query: { groupBy: ['sector'] } }],
      'FI Blotter',
    );

    const button = blotterMaximizeButton(container);
    expect(button).toBeTruthy();
    // Reachable because the group's header isn't collapsed away.
    expect(button!.closest('.dock-tab-group')?.hasAttribute('data-header-collapsed')).toBe(false);
  });

  it('keeps the blotter maximize button out of reach until a widget shares the space', () => {
    const { container, platform } = setup([{ sector: 'Tech', marketValue: 100 }], []);
    // With nothing else docked there is nothing to maximize away from, and
    // the collapsed header hides the button along with the rest of the bar.
    expect(blotterMaximizeButton(container)?.closest('.dock-tab-group')?.hasAttribute('data-header-collapsed')).toBe(
      true,
    );

    act(() => {
      platform.store.setModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID, () => ({
        widgets: [{ id: 'w1', title: 'Sector digest', kind: 'digest', query: { groupBy: ['sector'] } }],
      }));
    });

    expect(blotterMaximizeButton(container)?.closest('.dock-tab-group')?.hasAttribute('data-header-collapsed')).toBe(
      false,
    );
  });

  it('maximizing the blotter from its header keeps the same grid instance mounted', () => {
    const { container } = setup(
      [{ sector: 'Tech', marketValue: 100 }],
      [{ id: 'w1', title: 'Sector digest', kind: 'digest', query: { groupBy: ['sector'] } }],
    );
    const before = screen.getByTestId('ag-grid-stub');

    const maximize = container.querySelector('[data-action="maximize"][data-panel-id="blotter"]');
    fireEvent.mouseDown(maximize!, { button: 0 });

    // The grid is the same element — maximizing must never tear AG-Grid down
    // the way a close/re-add would. The header now offers `restore` instead.
    expect(container.querySelector('[data-testid="ag-grid-stub"]')).toBe(before);
    expect(container.querySelector('[data-action="restore"][data-panel-id="blotter"]')).toBeTruthy();
  });
});
