/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider.js';
import { SummaryPanelEditor, SummaryPanelList } from './SummaryPanelPanel.js';
import { summaryPanelModule, SUMMARY_PANEL_MODULE_ID, type SummaryPanelState } from './index.js';

function makePlatform() {
  return new GridPlatform({ gridId: 'test-grid', modules: [summaryPanelModule] });
}

function MasterDetail({ platform }: { platform: GridPlatform }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  return (
    <GridProvider platform={platform}>
      <SummaryPanelList gridId="test-grid" selectedId={selectedId} onSelect={setSelectedId} />
      <SummaryPanelEditor gridId="test-grid" selectedId={selectedId} />
    </GridProvider>
  );
}

describe('SummaryPanelPanel', () => {
  let platform: GridPlatform;

  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => {};
    }
  });

  beforeEach(() => { platform = makePlatform(); });
  afterEach(cleanup);

  it('starts empty and prompts to add a widget', () => {
    render(<MasterDetail platform={platform} />);
    expect(screen.getByText(/No widgets yet/)).toBeTruthy();
    expect(screen.getByText(/Add a widget to configure/)).toBeTruthy();
  });

  it('adding a widget selects it and defaults to a digest', () => {
    render(<MasterDetail platform={platform} />);
    fireEvent.click(screen.getByTestId('summary-panel-add-widget'));

    const state = platform.store.getModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID);
    expect(state.widgets).toHaveLength(1);
    expect(state.widgets[0].kind).toBe('digest');
    expect(screen.getByTestId('summary-panel-title-input')).toBeTruthy();
  });

  it('editing the title writes through to module state', () => {
    render(<MasterDetail platform={platform} />);
    fireEvent.click(screen.getByTestId('summary-panel-add-widget'));

    fireEvent.change(screen.getByTestId('summary-panel-title-input'), { target: { value: 'Sector exposure' } });

    const state = platform.store.getModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID);
    expect(state.widgets[0].title).toBe('Sector exposure');
    expect(screen.getByText('Sector exposure')).toBeTruthy(); // reflected in the list row
  });

  it('switching kind to heatmap reveals the pivot-by field and updates state', () => {
    render(<MasterDetail platform={platform} />);
    fireEvent.click(screen.getByTestId('summary-panel-add-widget'));

    expect(screen.queryByTestId('summary-panel-pivotby-input')).toBeNull();
    fireEvent.click(screen.getByTestId('summary-panel-kind-heatmap'));

    const state = platform.store.getModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID);
    expect(state.widgets[0].kind).toBe('heatmap');
    expect(screen.getByTestId('summary-panel-pivotby-input')).toBeTruthy();
  });

  it('switching kind to chart reveals the chart-kind field', () => {
    render(<MasterDetail platform={platform} />);
    fireEvent.click(screen.getByTestId('summary-panel-add-widget'));

    fireEvent.click(screen.getByTestId('summary-panel-kind-chart'));

    const state = platform.store.getModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID);
    expect(state.widgets[0].kind).toBe('chart');
    expect(screen.getByTestId('summary-panel-chartkind-select')).toBeTruthy();
  });

  it('typing group-by columns writes an array onto the query', () => {
    render(<MasterDetail platform={platform} />);
    fireEvent.click(screen.getByTestId('summary-panel-add-widget'));

    fireEvent.change(screen.getByTestId('summary-panel-groupby-input'), { target: { value: 'sector, product' } });

    const state = platform.store.getModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID);
    expect(state.widgets[0].query.groupBy).toEqual(['sector', 'product']);
  });

  it('deleting a widget clears the selection and the list', () => {
    render(<MasterDetail platform={platform} />);
    fireEvent.click(screen.getByTestId('summary-panel-add-widget'));

    const id = platform.store.getModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID).widgets[0].id;
    fireEvent.click(screen.getByTestId(`summary-panel-delete-${id}`));

    const state = platform.store.getModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID);
    expect(state.widgets).toHaveLength(0);
    expect(screen.getByText(/No widgets yet/)).toBeTruthy();
  });
});
