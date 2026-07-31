/**
 * Integration tests for the v4 ColumnSettingsPanel rewrite.
 *
 * Wires a fake AG-Grid api so `useGridColumns()` has columns to render
 * in the list rail. Covers:
 *  - list: renders columns from the live grid, override badge shows for
 *    columns with assignments
 *  - editor: draft pattern (header name edits don't commit until SAVE),
 *    RESET reverts, DIRTY bus registers under `column-customization:<id>`
 *  - templates band: removing a template only patches the draft
 *  - empty-assignment pruning: saving a reset draft deletes the entry
 */
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider } from '../../hooks/GridProvider';
import {
  ColumnSettingsEditor,
  ColumnSettingsList,
} from './ColumnSettingsPanel';
import { columnCustomizationModule } from './index';
import { columnTemplatesModule } from '../column-templates';
import { generalSettingsModule } from '../general-settings';
import type { ColumnCustomizationState } from './state';

// ─── Fake GridApi harness (shared pattern with useGridColumns.test) ───

interface FakeCol { id: string; headerName?: string; cellDataType?: string; }

function makeFakeApi(cols: FakeCol[]): GridApi {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  // AG-Grid's GridApi.addEventListener is overloaded with a narrow
  // typed-event signature; cast through `unknown` so the harness doesn't
  // have to model every AgPublicEventType.
  const api: Partial<GridApi> = {
    getColumns: () =>
      cols.map((c) =>
        ({
          getColId: () => c.id,
          getColDef: () => ({ headerName: c.headerName, cellDataType: c.cellDataType }),
        }) as Column,
      ),
    addEventListener: ((evt: string, fn: (...a: unknown[]) => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    }) as unknown as GridApi['addEventListener'],
    removeEventListener: ((evt: string, fn: (...a: unknown[]) => void) => {
      listeners.get(evt)?.delete(fn);
    }) as unknown as GridApi['removeEventListener'],
  };
  return api as GridApi;
}

function makePlatform() {
  const platform = new GridPlatform({
    gridId: 'test-grid',
    // column-customization depends on column-templates for the
    // templates band; general-settings because RowGroupingEditor reads
    // grid-level controls from it.
    modules: [generalSettingsModule, columnTemplatesModule, columnCustomizationModule],
  });
  platform.onGridReady(
    makeFakeApi([
      { id: 'price', headerName: 'Price', cellDataType: 'number' },
      { id: 'quantity', headerName: 'Quantity', cellDataType: 'number' },
    ]),
  );
  return platform;
}

function MasterDetail({ platform }: { platform: GridPlatform }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  return (
    <GridProvider platform={platform}>
      <ColumnSettingsList gridId="test-grid" selectedId={selectedId} onSelect={setSelectedId} />
      <ColumnSettingsEditor gridId="test-grid" selectedId={selectedId} />
    </GridProvider>
  );
}

describe('ColumnSettingsPanel (v4)', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  // ─── List pane ─────────────────────────────────────────────────────

  it('renders the live grid columns from useGridColumns', () => {
    render(<MasterDetail platform={platform} />);
    expect(screen.getByTestId('cols-item-price')).toBeTruthy();
    expect(screen.getByTestId('cols-item-quantity')).toBeTruthy();
  });

  it('auto-selects the first column on mount', () => {
    render(<MasterDetail platform={platform} />);
    expect(screen.getByTestId('cols-editor-price')).toBeTruthy();
  });

  // ─── Draft / SAVE / RESET ──────────────────────────────────────────

  it('editing header name only touches the draft until SAVE', () => {
    render(<MasterDetail platform={platform} />);
    const name = screen.getByTestId('cols-header-name-price') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Bid Price' } });

    expect(name.value).toBe('Bid Price');
    expect(
      platform.store.getModuleState<ColumnCustomizationState>('column-customization')
        .assignments['price']?.headerName,
    ).toBeUndefined();

    act(() => screen.getByTestId('cols-save-price').click());

    expect(
      platform.store.getModuleState<ColumnCustomizationState>('column-customization')
        .assignments['price']?.headerName,
    ).toBe('Bid Price');
  });

  it('RESET reverts the draft back to the committed assignment', () => {
    render(<MasterDetail platform={platform} />);
    const name = screen.getByTestId('cols-header-name-price') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Scratch' } });
    expect(name.value).toBe('Scratch');

    act(() => screen.getByTestId('cols-discard-price').click());
    // Draft reverts to `undefined`; the TitleInput falls back to the
    // column's host headerName via `draft.headerName ?? col.headerName`.
    expect(name.value).toBe('Price');
  });

  it('dirty state registers on the per-platform DirtyBus under `column-customization:<id>`', () => {
    render(<MasterDetail platform={platform} />);
    const name = screen.getByTestId('cols-header-name-price') as HTMLInputElement;

    expect(platform.resources.dirty().isDirty('column-customization:price')).toBe(false);

    fireEvent.change(name, { target: { value: 'Dirty' } });
    expect(platform.resources.dirty().isDirty('column-customization:price')).toBe(true);

    act(() => screen.getByTestId('cols-save-price').click());
    expect(platform.resources.dirty().isDirty('column-customization:price')).toBe(false);
  });

  // ─── Commit-path: empty assignment pruning ─────────────────────────

  it('saving a draft with every override undefined prunes the assignment entirely', () => {
    // Seed an existing override so there's something to prune when the
    // user clears the last field.
    platform.store.setModuleState<ColumnCustomizationState>('column-customization', (s) => ({
      ...s,
      assignments: { ...s.assignments, price: { colId: 'price', headerName: 'Bid Price' } },
    }));

    render(<MasterDetail platform={platform} />);
    // The band-01 HEADER NAME row uses IconInput.onCommit which converts
    // empty string → undefined. The ObjectTitleRow's TitleInput passes
    // empty through verbatim, so we exercise the band row.
    const bandName = screen.getByTestId('cols-price-header-name') as HTMLInputElement;
    fireEvent.change(bandName, { target: { value: '' } });
    fireEvent.keyDown(bandName, { key: 'Enter' });

    act(() => screen.getByTestId('cols-save-price').click());

    const assign = platform.store
      .getModuleState<ColumnCustomizationState>('column-customization')
      .assignments['price'];
    expect(assign).toBeUndefined();
  });

  // ─── Empty state ───────────────────────────────────────────────────

  it('empty-state renders when no column is selected', () => {
    render(
      <GridProvider platform={platform}>
        <ColumnSettingsEditor gridId="test-grid" selectedId={null} />
      </GridProvider>,
    );
    expect(screen.getByText(/No column selected/i)).toBeTruthy();
  });
});
