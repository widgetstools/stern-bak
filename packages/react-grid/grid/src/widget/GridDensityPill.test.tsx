import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import {
  GENERAL_SETTINGS_MODULE_ID,
  GridProvider,
  generalSettingsModule,
  type GeneralSettingsState,
} from '@wellsfargo-starui/grid/customizer';
import { GridDensityPill } from './GridDensityPill';

function mountPill(density: 'compact' | 'comfort' | 'ultra' = 'compact') {
  const platform = new GridPlatform({ gridId: 'g1', modules: [generalSettingsModule] });
  const setGridOption = vi.fn();
  platform.onGridReady({
    setGridOption,
    getGridOption: vi.fn(() => undefined),
    isDestroyed: () => false,
  } as unknown as GridApi);

  render(
    <GridProvider platform={platform}>
      <GridDensityPill density={density} />
    </GridProvider>,
  );
  return { platform, setGridOption };
}

describe('GridDensityPill', () => {
  it('returns null without a platform', () => {
    const { container } = render(<GridDensityPill density="compact" />);
    expect(container.firstChild).toBeNull();
  });

  it('opens the menu and applies a density preset', () => {
    const { platform } = mountPill('compact');

    fireEvent.click(screen.getByRole('button', { name: /Grid spacing: Compact/i }));
    fireEvent.pointerDown(screen.getByRole('radio', { name: 'Ultra' }));

    const state = platform.store.getModuleState<GeneralSettingsState>(GENERAL_SETTINGS_MODULE_ID);
    expect(state?.gridDensity).toBe('ultra');
  });

  it('closes when clicking outside', () => {
    mountPill();
    fireEvent.click(screen.getByTestId('grid-density-pill-chip'));
    expect(screen.getByTestId('grid-density-pill-menu')).toBeInTheDocument();
    act(() => {
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
  });
});
