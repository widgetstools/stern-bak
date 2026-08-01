/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import type { DataChangeHistoryState } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import { clearEditJournalRegistry, getEditJournal } from '../../editing/editJournalScope';
import { DataChangeHistoryPanel } from './DataChangeHistoryPanel';
import { dataChangeHistoryModule } from './index';

function makePlatform(): GridPlatform {
  return new GridPlatform({ gridId: 'test-grid', modules: [dataChangeHistoryModule] });
}

describe('DataChangeHistoryPanel', () => {
  let platform: GridPlatform;

  beforeEach(() => {
    clearEditJournalRegistry();
    platform = makePlatform();
  });

  it('renders settings and monitor section', () => {
    render(
      <GridProvider platform={platform}>
        <DataChangeHistoryPanel />
      </GridProvider>,
    );
    expect(screen.getByTestId('edit-history-panel')).toBeTruthy();
    expect(screen.getByTestId('dch-enabled-toggle')).toBeTruthy();
    expect(screen.getByTestId('dch-monitor-section')).toBeTruthy();
    expect(screen.getByTestId('dch-monitor-empty')).toBeTruthy();
  });

  it('SAVE commits max entries', () => {
    render(
      <GridProvider platform={platform}>
        <DataChangeHistoryPanel />
      </GridProvider>,
    );
    const input = screen.getByTestId('dch-max-entries-input');
    act(() => {
      fireEvent.change(input, { target: { value: '25' } });
      fireEvent.blur(input);
    });
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(platform.store.getModuleState<DataChangeHistoryState>('data-change-history').settings.maxEntries).toBe(25);
  });

  it('shows journal entries recorded on this grid', () => {
    const journal = getEditJournal(platform);
    journal.record({
      source: 'bulk-update',
      label: 'Bulk set qty',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 2 }],
    });

    render(
      <GridProvider platform={platform}>
        <DataChangeHistoryPanel />
      </GridProvider>,
    );
    expect(screen.getByTestId('dch-monitor-table')).toBeTruthy();
    expect(screen.getByText('Bulk set qty')).toBeTruthy();
  });

  it('toggle record source updates draft', () => {
    render(
      <GridProvider platform={platform}>
        <DataChangeHistoryPanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('dch-source-stream-toggle')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(
      platform.store.getModuleState<DataChangeHistoryState>('data-change-history').settings.recordSources.stream,
    ).toBe(true);
  });

  it('undo from monitor applies journal reversal when grid api is ready', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    platform.onGridReady({
      applyTransactionAsync,
      getRowNode: () => ({ data: { id: 'r1', qty: 2 } }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as never);
    const journal = getEditJournal(platform);
    journal.record({
      source: 'bulk-update',
      label: 'Set qty',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 2 }],
    });

    render(
      <GridProvider platform={platform}>
        <DataChangeHistoryPanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('dch-undo-entry-' + journal.entries[0]!.id)));
    await waitFor(() => {
      expect(applyTransactionAsync).toHaveBeenCalled();
    });
  });

  it('undo from monitor is a no-op without grid api', () => {
    const journal = getEditJournal(platform);
    journal.record({
      source: 'bulk-update',
      label: 'Set qty',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 2 }],
    });

    render(
      <GridProvider platform={platform}>
        <DataChangeHistoryPanel />
      </GridProvider>,
    );
    expect(() => {
      act(() => fireEvent.click(screen.getByTestId('dch-undo-entry-' + journal.entries[0]!.id)));
    }).not.toThrow();
  });

  it('SAVE commits enabled, suspended, and unifyUndo toggles', () => {
    render(
      <GridProvider platform={platform}>
        <DataChangeHistoryPanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('dch-enabled-toggle')));
    act(() => fireEvent.click(screen.getByTestId('dch-suspended-toggle')));
    act(() => fireEvent.click(screen.getByTestId('dch-unify-undo-toggle')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    const settings = platform.store.getModuleState<DataChangeHistoryState>('data-change-history').settings;
    expect(settings.enabled).toBe(false);
    expect(settings.suspended).toBe(true);
    expect(settings.unifyUndo).toBe(false);
  });

  it('Reset discards unsaved draft without touching committed state', () => {
    render(
      <GridProvider platform={platform}>
        <DataChangeHistoryPanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('dch-enabled-toggle')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Reset' })));
    expect(platform.store.getModuleState<DataChangeHistoryState>('data-change-history').settings.enabled).toBe(true);
  });
});
