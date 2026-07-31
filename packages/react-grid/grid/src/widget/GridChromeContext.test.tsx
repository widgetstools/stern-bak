import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GridChromeProvider, useGridChromeState, type GridChromeState } from './GridChromeContext';

function Probe() {
  const state = useGridChromeState();
  return <span data-testid="probe">{state ? String(state.settingsOpen) : 'null'}</span>;
}

function makeState(overrides: Partial<GridChromeState> = {}): GridChromeState {
  return {
    settingsOpen: false,
    setSettingsOpen: vi.fn(),
    styleToolbarOpen: false,
    editingToolbarOpen: false,
    saveFlash: false,
    isDirty: false,
    ...overrides,
  };
}

describe('GridChromeContext', () => {
  it('provides chrome state to descendants', () => {
    const value = makeState({ settingsOpen: true });
    render(
      <GridChromeProvider value={value}>
        <Probe />
      </GridChromeProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('true');
  });

  it('returns null outside a provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('null');
  });
});
