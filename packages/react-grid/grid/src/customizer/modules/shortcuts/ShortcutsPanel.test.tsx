/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import { ShortcutsEditor, ShortcutsList, ShortcutsPanel } from './ShortcutsPanel';
import { editingModule } from '../editing';
import type { EditingState } from '@wellsfargo-starui/core';

function makePlatform() {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [editingModule] });
  platform.store.setModuleState<EditingState>('editing', (s) => ({
    ...s,
    shortcuts: {
      ...s.shortcuts,
      shortcuts: [{
        id: 'sc-one',
        name: 'Halve',
        enabled: true,
        shortcutKey: 'h',
        operation: 'divide',
        shortcutValue: 2,
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
      <ShortcutsList gridId="test-grid" selectedId={selectedId} onSelect={setSelectedId} />
      <ShortcutsEditor gridId="test-grid" selectedId={selectedId} />
    </GridProvider>
  );
}

describe('ShortcutsPanel', () => {
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

  it('flat panel renders settings and seeded shortcut', () => {
    render(
      <GridProvider platform={platform}>
        <ShortcutsPanel />
      </GridProvider>,
    );
    expect(screen.getByTestId('shortcuts-panel-flat')).toBeTruthy();
    expect(screen.getByTestId('sc-shortcut-item-sc-one')).toBeTruthy();
    expect(screen.getByTestId('sc-shortcut-key-input')).toBeTruthy();
  });

  it('auto-selects the first shortcut', () => {
    render(<MasterDetail platform={platform} />);
    expect(screen.getByTestId('sc-shortcut-key-input')).toBeTruthy();
  });

  it('ADD appends a shortcut', () => {
    render(<MasterDetail platform={platform} />);
    const before = platform.store.getModuleState<EditingState>('editing').shortcuts.shortcuts.length;
    act(() => screen.getByTestId('sc-add-shortcut').click());
    expect(platform.store.getModuleState<EditingState>('editing').shortcuts.shortcuts.length).toBe(before + 1);
  });

  it('operation buttons update shortcut operation', () => {
    render(<MasterDetail platform={platform} />);
    act(() => fireEvent.click(screen.getByTestId('sc-shortcut-op-multiply')));
    const sc = platform.store.getModuleState<EditingState>('editing').shortcuts.shortcuts.find((s) => s.id === 'sc-one');
    expect(sc?.operation).toBe('multiply');
  });

  it('SAVE commits recordHistory toggle', () => {
    render(
      <GridProvider platform={platform}>
        <ShortcutsPanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('sc-record-history-toggle')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(platform.store.getModuleState<EditingState>('editing').shortcuts.settings.recordHistory).toBe(false);
  });

  it('deletes a shortcut and clears selection', () => {
    render(<MasterDetail platform={platform} />);
    act(() => fireEvent.click(screen.getByLabelText('Delete Halve')));
    expect(platform.store.getModuleState<EditingState>('editing').shortcuts.shortcuts).toHaveLength(0);
    expect(screen.getByText(/Add a shortcut/i)).toBeTruthy();
  });

  it('rejects invalid shortcut keys and accepts letters', () => {
    render(<MasterDetail platform={platform} />);
    const keyInput = screen.getByTestId('sc-shortcut-key-input') as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: '9' } });
    expect(platform.store.getModuleState<EditingState>('editing').shortcuts.shortcuts[0]?.shortcutKey).toBe('h');

    fireEvent.change(keyInput, { target: { value: 'Z' } });
    expect(platform.store.getModuleState<EditingState>('editing').shortcuts.shortcuts[0]?.shortcutKey).toBe('z');
  });

  it('updates shortcut value, columns scope, and enabled toggle', () => {
    render(<MasterDetail platform={platform} />);
    act(() => {
      fireEvent.change(screen.getByTestId('sc-shortcut-value-input'), { target: { value: '7' } });
      fireEvent.blur(screen.getByTestId('sc-shortcut-value-input'));
    });
    act(() => {
      fireEvent.change(screen.getByTestId('sc-shortcut-columns-input'), { target: { value: 'qty, price' } });
    });
    act(() => fireEvent.click(screen.getByTestId('sc-shortcut-enabled-toggle')));

    const sc = platform.store.getModuleState<EditingState>('editing').shortcuts.shortcuts[0];
    expect(sc?.shortcutValue).toBe(7);
    expect(sc?.scope.columnIds).toEqual(['qty', 'price']);
    expect(sc?.enabled).toBe(false);
  });

  it('divide and subtract operation buttons update shortcut operation', () => {
    render(<MasterDetail platform={platform} />);
    act(() => fireEvent.click(screen.getByTestId('sc-shortcut-op-divide')));
    expect(platform.store.getModuleState<EditingState>('editing').shortcuts.shortcuts[0]?.operation).toBe('divide');

    act(() => fireEvent.click(screen.getByTestId('sc-shortcut-op-subtract')));
    expect(platform.store.getModuleState<EditingState>('editing').shortcuts.shortcuts[0]?.operation).toBe('subtract');
  });

  it('ShortcutsEditor shows guidance when no shortcut is selected', () => {
    render(
      <GridProvider platform={platform}>
        <ShortcutsEditor gridId="test-grid" selectedId={null} />
      </GridProvider>,
    );
    expect(screen.getByText(/Add a shortcut/i)).toBeTruthy();
  });
});
