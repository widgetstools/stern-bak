/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { EditJournal } from '@wellsfargo-starui/engine';
import { EditHistoryMonitor } from './EditHistoryMonitor';

function makeEntry(id: string, source: 'bulk-update' | 'smart-edit' = 'bulk-update') {
  return {
    id,
    at: Date.now(),
    source,
    label: `Entry ${id}`,
    patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 2 }],
  };
}

describe('EditHistoryMonitor', () => {
  it('shows empty state when no entries', () => {
    render(
      <EditHistoryMonitor entries={[]} canUndoEntry={() => false} onUndo={() => {}} />,
    );
    expect(screen.getByTestId('dch-monitor-empty')).toBeTruthy();
    expect(screen.getByText(/No edits recorded/i)).toBeTruthy();
  });

  it('renders entry rows with undo buttons', () => {
    const entries = [makeEntry('e1'), makeEntry('e2', 'smart-edit')];
    render(
      <EditHistoryMonitor
        entries={entries}
        canUndoEntry={(id) => id === 'e1'}
        onUndo={() => {}}
      />,
    );
    expect(screen.getByTestId('dch-monitor-table')).toBeTruthy();
    expect(screen.getByTestId('dch-entry-e1')).toBeTruthy();
    expect(screen.getByTestId('dch-entry-e2')).toBeTruthy();
    expect((screen.getByTestId('dch-undo-entry-e1') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('dch-undo-entry-e2') as HTMLButtonElement).disabled).toBe(true);
  });

  it('onUndo fires with entry id', () => {
    let undone = '';
    render(
      <EditHistoryMonitor
        entries={[makeEntry('e1')]}
        canUndoEntry={() => true}
        onUndo={(id) => { undone = id; }}
      />,
    );
    act(() => fireEvent.click(screen.getByTestId('dch-undo-entry-e1')));
    expect(undone).toBe('e1');
  });

  it('renders all rows when viewport height is zero (jsdom)', () => {
    const entries = Array.from({ length: 30 }, (_, i) => makeEntry(`e${i}`));
    render(
      <EditHistoryMonitor entries={entries} canUndoEntry={() => true} onUndo={() => {}} />,
    );
    expect(screen.getByTestId('dch-monitor-scroll')).toBeTruthy();
    expect(screen.queryAllByTestId(/^dch-entry-/).length).toBe(30);
  });

  it('renders source badges for all edit sources', () => {
    const entries = [
      makeEntry('e1', 'plus-minus'),
      makeEntry('e2', 'shortcut'),
      makeEntry('e3', 'cell-editor'),
    ];
    render(
      <EditHistoryMonitor entries={entries} canUndoEntry={() => true} onUndo={() => {}} />,
    );
    expect(screen.getByText('+/−')).toBeTruthy();
    expect(screen.getByText('Shortcut')).toBeTruthy();
    expect(screen.getByText('Cell')).toBeTruthy();
  });
});
