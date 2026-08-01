/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditJournal } from '@wellsfargo-starui/engine';
import { GridPlatform } from '@wellsfargo-starui/engine';
import type { DataChangeHistoryState } from '@wellsfargo-starui/engine';
import { GridProvider } from '../../hooks/GridProvider';
import { clearEditJournalRegistry, getEditJournal } from '../../editing/editJournalScope';
import { EditHistoryToolbarBody } from './EditHistoryToolbarBody';
import { dataChangeHistoryModule } from './index';

function makeMockApi() {
  const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
  return {
    applyTransactionAsync,
    getRowNode: () => ({ data: { id: 'r1', qty: 1 } }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

describe('EditHistoryToolbarBody', () => {
  let platform: GridPlatform;

  beforeEach(() => {
    clearEditJournalRegistry();
    platform = new GridPlatform({ gridId: 'test-grid', modules: [dataChangeHistoryModule] });
    platform.store.setModuleState<DataChangeHistoryState>('data-change-history', (s) => ({
      ...s,
      settings: { ...s.settings, enabled: true },
    }));
  });

  it('returns null when history disabled', () => {
    platform.store.setModuleState<DataChangeHistoryState>('data-change-history', (s) => ({
      ...s,
      settings: { ...s.settings, enabled: false },
    }));
    const { container } = render(
      <GridProvider platform={platform}>
        <EditHistoryToolbarBody />
      </GridProvider>,
    );
    expect(container.querySelector('[data-testid="edit-history-toolbar"]')).toBeNull();
  });

  it('renders undo/redo with entry count', () => {
    const journal = getEditJournal(platform);
    journal.record({
      source: 'bulk-update',
      label: 'Set qty',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 2 }],
    });

    render(
      <GridProvider platform={platform}>
        <EditHistoryToolbarBody />
      </GridProvider>,
    );
    expect(screen.getByTestId('edit-history-toolbar')).toBeTruthy();
    expect(screen.getByTestId('edit-history-count').textContent).toMatch(/1 entry/);
    expect((screen.getByTestId('edit-history-undo') as HTMLButtonElement).disabled).toBe(false);
  });

  it('undo applies journal reversal through grid api', async () => {
    const api = makeMockApi();
    platform.onGridReady(api as never);
    const journal = getEditJournal(platform);
    journal.record({
      source: 'bulk-update',
      label: 'Set qty',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 2 }],
    });

    render(
      <GridProvider platform={platform}>
        <EditHistoryToolbarBody />
      </GridProvider>,
    );

    act(() => fireEvent.click(screen.getByTestId('edit-history-undo')));
    await waitFor(() => {
      expect(api.applyTransactionAsync).toHaveBeenCalled();
    });
    expect(journal.canUndo).toBe(false);
  });

  it('redo applies journal forward through grid api', async () => {
    const api = makeMockApi();
    platform.onGridReady(api as never);
    const journal = getEditJournal(platform);
    journal.record({
      source: 'bulk-update',
      label: 'Set qty',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 2 }],
    });

    render(
      <GridProvider platform={platform}>
        <EditHistoryToolbarBody />
      </GridProvider>,
    );

    act(() => fireEvent.click(screen.getByTestId('edit-history-undo')));
    await waitFor(() => {
      expect(journal.canRedo).toBe(true);
    });

    act(() => fireEvent.click(screen.getByTestId('edit-history-redo')));
    await waitFor(() => {
      expect(api.applyTransactionAsync).toHaveBeenCalledTimes(2);
    });
    expect(journal.canRedo).toBe(false);
  });

  it('shows plural entry count and ignores undo without api', () => {
    const journal = getEditJournal(platform);
    journal.record({
      source: 'bulk-update',
      label: 'A',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 2 }],
    });
    journal.record({
      source: 'bulk-update',
      label: 'B',
      patches: [{ rowId: 'r2', colId: 'qty', field: 'qty', prev: 3, next: 4 }],
    });

    render(
      <GridProvider platform={platform}>
        <EditHistoryToolbarBody />
      </GridProvider>,
    );
    expect(screen.getByTestId('edit-history-count').textContent).toMatch(/2 entries/);
    act(() => fireEvent.click(screen.getByTestId('edit-history-undo')));
    expect(journal.canUndo).toBe(true);
  });
});
