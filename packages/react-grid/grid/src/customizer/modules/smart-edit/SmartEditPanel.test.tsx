/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider } from '../../hooks/GridProvider';
import { SmartEditPanel } from './SmartEditPanel';
import { smartEditModule } from './index';

function makePlatform(): GridPlatform {
  return new GridPlatform({ gridId: 'test-grid', modules: [smartEditModule] });
}

function mount(platform: GridPlatform) {
  return render(
    <GridProvider platform={platform}>
      <SmartEditPanel />
    </GridProvider>,
  );
}

describe('SmartEditPanel', () => {
  let platform: GridPlatform;

  beforeEach(() => {
    platform = makePlatform();
  });

  it('renders panel shell and settings controls', () => {
    mount(platform);
    expect(screen.getByTestId('smart-edit-panel')).toBeTruthy();
    expect(screen.getByTestId('se-enabled-toggle')).toBeTruthy();
    expect(screen.getByTestId('se-increment-input')).toBeTruthy();
    expect(screen.getByTestId('se-magnitude-toggle')).toBeTruthy();
    expect(screen.getByTestId('se-confirm-input')).toBeTruthy();
    for (const op of ['multiply', 'divide', 'add', 'subtract', 'set']) {
      expect(screen.getByTestId(`se-op-${op}`)).toBeTruthy();
    }
  });

  it('starts clean — Save/Reset disabled until draft changes', () => {
    mount(platform);
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    const reset = screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(reset.disabled).toBe(true);
  });

  it('SAVE commits enabled toggle into module state', () => {
    mount(platform);
    act(() => {
      fireEvent.click(screen.getByTestId('se-enabled-toggle'));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(platform.store.getModuleState('smart-edit').settings.enabled).toBe(false);
  });

  it('toggle op buttons update enabledOps draft', () => {
    mount(platform);
    act(() => {
      fireEvent.click(screen.getByTestId('se-op-multiply'));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    const ops = platform.store.getModuleState('smart-edit').settings.enabledOps;
    expect(ops.includes('multiply')).toBe(false);
  });

  it('DISCARD reverts draft changes', () => {
    mount(platform);
    act(() => {
      fireEvent.click(screen.getByTestId('se-enabled-toggle'));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    });
    expect(platform.store.getModuleState('smart-edit').settings.enabled).toBe(true);
  });
});
