/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import { VisualExcelPanel } from './VisualExcelPanel';
import { visualExcelModule } from './index';
import type { VisualExcelState } from '@wellsfargo-starui/core';

function makePlatform(): GridPlatform {
  return new GridPlatform({ gridId: 'test-grid', modules: [visualExcelModule] });
}

describe('VisualExcelPanel', () => {
  let platform: GridPlatform;

  beforeEach(() => {
    platform = makePlatform();
  });

  it('renders enabled toggle', () => {
    render(
      <GridProvider platform={platform}>
        <VisualExcelPanel />
      </GridProvider>,
    );
    expect(screen.getByTestId('visual-excel-panel')).toBeTruthy();
    expect(screen.getByTestId('visual-excel-enabled-toggle')).toBeTruthy();
  });

  it('SAVE commits enabled toggle', () => {
    render(
      <GridProvider platform={platform}>
        <VisualExcelPanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('visual-excel-enabled-toggle')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(platform.store.getModuleState<VisualExcelState>('visual-excel').settings.enabled).toBe(false);
  });
});
