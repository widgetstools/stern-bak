/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider } from '../../hooks/GridProvider';
import { BulkUpdatePanel } from './BulkUpdatePanel';
import { bulkUpdateModule } from './index';
import type { BulkUpdateState } from '@wellsfargo-starui/engine';

function makePlatform(): GridPlatform {
  return new GridPlatform({ gridId: 'test-grid', modules: [bulkUpdateModule] });
}

describe('BulkUpdatePanel', () => {
  let platform: GridPlatform;

  beforeEach(() => {
    platform = makePlatform();
  });

  it('renders settings controls', () => {
    render(
      <GridProvider platform={platform}>
        <BulkUpdatePanel />
      </GridProvider>,
    );
    expect(screen.getByTestId('bulk-update-panel')).toBeTruthy();
    expect(screen.getByTestId('bu-enabled-toggle')).toBeTruthy();
    expect(screen.getByTestId('bu-confirm-input')).toBeTruthy();
    expect(screen.getByTestId('bu-distinct-toggle')).toBeTruthy();
  });

  it('starts clean — Save disabled until draft changes', () => {
    render(
      <GridProvider platform={platform}>
        <BulkUpdatePanel />
      </GridProvider>,
    );
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('SAVE commits confirm threshold', () => {
    render(
      <GridProvider platform={platform}>
        <BulkUpdatePanel />
      </GridProvider>,
    );
    const input = screen.getByTestId('bu-confirm-input');
    act(() => {
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.blur(input);
    });
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(platform.store.getModuleState<BulkUpdateState>('bulk-update').settings.confirmThreshold).toBe(5);
  });

  it('DISCARD reverts staged settings', () => {
    render(
      <GridProvider platform={platform}>
        <BulkUpdatePanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('bu-record-history-toggle')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Reset' })));
    expect(platform.store.getModuleState<BulkUpdateState>('bulk-update').settings.recordHistory).toBe(true);
  });

  it('toggle distinct values dropdown setting', () => {
    render(
      <GridProvider platform={platform}>
        <BulkUpdatePanel />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('bu-distinct-toggle')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(platform.store.getModuleState<BulkUpdateState>('bulk-update').settings.showDistinctValues).toBe(false);
  });
});
