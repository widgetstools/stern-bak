/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import { PlusMinusEditor, PlusMinusList, PlusMinusPanel } from './PlusMinusPanel';
import { editingModule } from '../editing';
import type { EditingState } from '@wellsfargo-starui/core';

function makePlatform() {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [editingModule] });
  platform.store.setModuleState<EditingState>('editing', (s) => ({
    ...s,
    plusMinus: {
      ...s.plusMinus,
      nudges: [{
        id: 'nudge-one',
        name: 'Qty step',
        enabled: true,
        incrementStep: 1,
        scope: { columnIds: ['qty'] },
      }],
    },
  }));
  return platform;
}

function MasterDetail({ platform }: { platform: GridPlatform }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  return (
    <GridProvider platform={platform}>
      <PlusMinusList gridId="test-grid" selectedId={selectedId} onSelect={setSelectedId} />
      <PlusMinusEditor gridId="test-grid" selectedId={selectedId} />
    </GridProvider>
  );
}

describe('PlusMinusPanel', () => {
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

  it('flat panel renders settings and seeded nudge list', () => {
    render(
      <GridProvider platform={platform}>
        <PlusMinusPanel />
      </GridProvider>,
    );
    expect(screen.getByTestId('plus-minus-panel-flat')).toBeTruthy();
    expect(screen.getByTestId('pm-nudge-item-nudge-one')).toBeTruthy();
    expect(screen.getByTestId('pm-nudge-name-input')).toBeTruthy();
  });

  it('auto-selects the first nudge in master-detail layout', () => {
    render(<MasterDetail platform={platform} />);
    expect(screen.getByTestId('pm-nudge-name-input')).toBeTruthy();
  });

  it('ADD creates a nudge and selects it', () => {
    render(<MasterDetail platform={platform} />);
    const before = platform.store.getModuleState<EditingState>('editing').plusMinus.nudges.length;
    act(() => screen.getByTestId('pm-add-nudge').click());
    const after = platform.store.getModuleState<EditingState>('editing').plusMinus.nudges.length;
    expect(after).toBe(before + 1);
  });

  it('SAVE commits global enabled toggle', () => {
    render(
      <GridProvider platform={platform}>
        <PlusMinusPanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('pm-enabled-toggle')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(platform.store.getModuleState<EditingState>('editing').plusMinus.settings.enabled).toBe(false);
  });

  it('rename nudge updates module state immediately', () => {
    render(<MasterDetail platform={platform} />);
    const input = screen.getByTestId('pm-nudge-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Face qty' } });
    const nudge = platform.store.getModuleState<EditingState>('editing').plusMinus.nudges.find((n) => n.id === 'nudge-one');
    expect(nudge?.name).toBe('Face qty');
  });

  it('empty editor shows guidance when no nudge selected', () => {
    render(
      <GridProvider platform={platform}>
        <PlusMinusEditor gridId="test-grid" selectedId={null} />
      </GridProvider>,
    );
    expect(screen.getByText(/Add a nudge rule/i)).toBeTruthy();
  });

  it('deletes a nudge from the list', () => {
    render(<MasterDetail platform={platform} />);
    act(() => fireEvent.click(screen.getByLabelText('Delete Qty step')));
    expect(platform.store.getModuleState<EditingState>('editing').plusMinus.nudges).toHaveLength(0);
  });

  it('updates increment, decrement, columns, and enabled toggle', () => {
    render(<MasterDetail platform={platform} />);
    act(() => {
      fireEvent.change(screen.getByTestId('pm-nudge-increment-input'), { target: { value: '5' } });
      fireEvent.blur(screen.getByTestId('pm-nudge-increment-input'));
    });
    act(() => {
      fireEvent.change(screen.getByTestId('pm-nudge-decrement-input'), { target: { value: '2' } });
      fireEvent.blur(screen.getByTestId('pm-nudge-decrement-input'));
    });
    act(() => {
      fireEvent.change(screen.getByTestId('pm-nudge-columns-input'), { target: { value: 'qty, mid' } });
    });
    act(() => fireEvent.click(screen.getByTestId('pm-nudge-enabled-toggle')));

    const nudge = platform.store.getModuleState<EditingState>('editing').plusMinus.nudges[0];
    expect(nudge?.incrementStep).toBe(5);
    expect(nudge?.decrementStep).toBe(2);
    expect(nudge?.scope.columnIds).toEqual(['qty', 'mid']);
    expect(nudge?.enabled).toBe(false);
  });

  it('SAVE commits recordHistory toggle', () => {
    render(
      <GridProvider platform={platform}>
        <PlusMinusPanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('pm-record-history-toggle')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(platform.store.getModuleState<EditingState>('editing').plusMinus.settings.recordHistory).toBe(false);
  });

  it('Reset reverts unsaved global settings in flat panel', () => {
    render(
      <GridProvider platform={platform}>
        <PlusMinusPanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('pm-enabled-toggle')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Reset' })));
    expect(platform.store.getModuleState<EditingState>('editing').plusMinus.settings.enabled).toBe(true);
  });

  it('selects another nudge from the list rail', () => {
    platform.store.setModuleState<EditingState>('editing', (s) => ({
      ...s,
      plusMinus: {
        ...s.plusMinus,
        nudges: [
          ...s.plusMinus.nudges,
          {
            id: 'nudge-two',
            name: 'Mid step',
            enabled: true,
            incrementStep: 2,
            scope: { columnIds: ['mid'] },
          },
        ],
      },
    }));
    render(<MasterDetail platform={platform} />);
    act(() => fireEvent.click(screen.getByTestId('pm-nudge-item-nudge-two')));
    expect(screen.getByTestId('pm-nudge-name-input')).toHaveValue('Mid step');
  });

  it('renders nudge expression band with empty expression validation', () => {
    render(<MasterDetail platform={platform} />);
    expect(screen.getByTestId('pm-nudge-expression-nudge-one')).toBeTruthy();
  });

  it('shows empty editor guidance in list-only layout', () => {
    render(
      <GridProvider platform={platform}>
        <PlusMinusEditor gridId="test-grid" selectedId={null} />
      </GridProvider>,
    );
    expect(screen.getByText(/Add a nudge rule/i)).toBeTruthy();
  });

  it('settings band save commits staged global settings', () => {
    render(
      <GridProvider platform={platform}>
        <PlusMinusPanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('pm-record-history-toggle')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(platform.store.getModuleState<EditingState>('editing').plusMinus.settings.recordHistory).toBe(false);
  });

  it('flat panel omits editor pane when no nudges exist', () => {
    platform.store.setModuleState<EditingState>('editing', (s) => ({
      ...s,
      plusMinus: { ...s.plusMinus, nudges: [] },
    }));
    render(
      <GridProvider platform={platform}>
        <PlusMinusPanel />
      </GridProvider>,
    );
    expect(screen.queryByTestId('pm-nudge-name-input')).toBeNull();
  });

  it('list pane auto-selects the first nudge', () => {
    const onSelect = vi.fn();
    render(
      <GridProvider platform={platform}>
        <PlusMinusList gridId="test-grid" selectedId={null} onSelect={onSelect} />
      </GridProvider>,
    );
    expect(onSelect).toHaveBeenCalledWith('nudge-one');
  });
});
