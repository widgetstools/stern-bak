/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider } from '../../hooks/GridProvider';
import { AlertsEditor, AlertsList, AlertsPanel, AlertsSettingsBand } from './AlertsPanel';
import { alertsModule } from './index';
import type { AlertsState, AlertRule } from '@wellsfargo-starui/engine';

function seedRule(): AlertRule {
  return {
    id: 'alert-one',
    name: 'Price spike',
    enabled: true,
    priority: 1,
    severity: 'warning',
    trigger: { kind: 'dataChange', expression: '[price] > 100' },
    message: '{rule} on {rowId}',
    channels: ['toast', 'badge'],
  };
}

function makePlatform() {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [alertsModule] });
  platform.store.setModuleState<AlertsState>('alerts', (s) => ({
    ...s,
    rules: [seedRule()],
  }));
  return platform;
}

function MasterDetail({ platform }: { platform: GridPlatform }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  return (
    <GridProvider platform={platform}>
      <AlertsList gridId="test-grid" selectedId={selectedId} onSelect={setSelectedId} />
      <AlertsEditor gridId="test-grid" selectedId={selectedId} />
    </GridProvider>
  );
}

describe('AlertsPanel', () => {
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
    if (!HTMLElement.prototype.hasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = () => false;
      HTMLElement.prototype.setPointerCapture = () => {};
      HTMLElement.prototype.releasePointerCapture = () => {};
    }
  });

  beforeEach(() => { platform = makePlatform(); });
  afterEach(cleanup);

  it('combined panel renders list and editor', () => {
    render(
      <GridProvider platform={platform}>
        <AlertsPanel />
      </GridProvider>,
    );
    expect(screen.getByTestId('alerts-rule-row-alert-one')).toBeTruthy();
    expect(screen.getByTestId('alerts-rule-editor')).toBeTruthy();
  });

  it('auto-selects first rule in master-detail', () => {
    render(<MasterDetail platform={platform} />);
    expect(screen.getByTestId('alerts-rule-editor')).toBeTruthy();
  });

  it('ADD creates a rule and selects it', () => {
    render(<MasterDetail platform={platform} />);
    const before = platform.store.getModuleState<AlertsState>('alerts').rules.length;
    act(() => screen.getByTestId('alerts-add-rule').click());
    expect(platform.store.getModuleState<AlertsState>('alerts').rules.length).toBe(before + 1);
  });

  it('SAVE commits rule name draft', () => {
    render(<MasterDetail platform={platform} />);
    const nameInput = screen.getByTestId('alerts-rule-name-alert-one') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Big move' } });
    act(() => screen.getByTestId('alerts-rule-save-alert-one').click());
    const rule = platform.store.getModuleState<AlertsState>('alerts').rules.find((r) => r.id === 'alert-one');
    expect(rule?.name).toBe('Big move');
  });

  it('settings band toggles evaluation mode', () => {
    render(
      <GridProvider platform={platform}>
        <AlertsSettingsBand
          settings={platform.store.getModuleState<AlertsState>('alerts').settings}
          onChange={(fn) => {
            platform.store.setModuleState<AlertsState>('alerts', (s) => ({
              ...s,
              settings: fn(s.settings),
            }));
          }}
        />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('alerts-mode-paused')));
    expect(platform.store.getModuleState<AlertsState>('alerts').settings.evaluationMode).toBe('paused');
  });

  it('DELETE removes the selected rule from module state', () => {
    render(<MasterDetail platform={platform} />);
    act(() => fireEvent.click(screen.getByTestId('alerts-delete-alert-one')));
    expect(platform.store.getModuleState<AlertsState>('alerts').rules).toHaveLength(0);
  });

  it('CLONE copies the selected rule with a unique name', () => {
    render(<MasterDetail platform={platform} />);
    const before = platform.store.getModuleState<AlertsState>('alerts').rules.length;
    act(() => fireEvent.click(screen.getByTestId('alerts-clone-alert-one')));
    const rules = platform.store.getModuleState<AlertsState>('alerts').rules;
    expect(rules.length).toBe(before + 1);
    expect(rules.some((r) => r.name.includes('Price spike (copy)'))).toBe(true);
  });

  it('SAVE commits severity and message template drafts', () => {
    render(<MasterDetail platform={platform} />);
    act(() => fireEvent.click(screen.getByTestId('alerts-severity-critical-alert-one')));
    fireEvent.change(screen.getByTestId('alerts-message-input-alert-one'), {
      target: { value: 'Critical move on {rowId}' },
    });
    act(() => screen.getByTestId('alerts-rule-save-alert-one').click());
    const rule = platform.store.getModuleState<AlertsState>('alerts').rules.find((r) => r.id === 'alert-one');
    expect(rule?.severity).toBe('critical');
    expect(rule?.message).toBe('Critical move on {rowId}');
  });

  it('switching trigger kind to rowChange updates the draft shape', async () => {
    const user = userEvent.setup();
    render(<MasterDetail platform={platform} />);
    await user.click(screen.getByTestId('alerts-trigger-rowChange-alert-one'));
    act(() => screen.getByTestId('alerts-rule-save-alert-one').click());
    const rule = platform.store.getModuleState<AlertsState>('alerts').rules.find((r) => r.id === 'alert-one');
    expect(rule?.trigger).toEqual({ kind: 'rowChange', event: 'ROW_ADDED' });
  });

  it('settings band toggles toast channel and history limit', () => {
    render(
      <GridProvider platform={platform}>
        <AlertsSettingsBand
          settings={platform.store.getModuleState<AlertsState>('alerts').settings}
          onChange={(fn) => {
            platform.store.setModuleState<AlertsState>('alerts', (s) => ({
              ...s,
              settings: fn(s.settings),
            }));
          }}
        />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('alerts-channel-toast')));
    act(() => {
      fireEvent.change(screen.getByTestId('alerts-history-limit'), { target: { value: '250' } });
    });
    const settings = platform.store.getModuleState<AlertsState>('alerts').settings;
    expect(settings.enabledChannels.toast).toBe(false);
    expect(settings.historyLimit).toBe(250);
  });

  it('relative-change trigger tab edits threshold and direction', async () => {
    const user = userEvent.setup();
    platform.onGridReady({
      getColumns: () => [{ getColId: () => 'price', getColDef: () => ({ headerName: 'Price' }) }],
      addEventListener: () => {},
      removeEventListener: () => {},
    } as never);
    render(<MasterDetail platform={platform} />);
    await user.click(screen.getByTestId('alerts-trigger-relativeChange-alert-one'));
    await user.click(screen.getByTestId('alerts-relative-mode'));
    await user.click(await screen.findByRole('option', { name: 'Percent change' }));
    fireEvent.change(screen.getByTestId('alerts-relative-threshold'), { target: { value: '5' } });
    act(() => fireEvent.click(screen.getByTestId('alerts-relative-direction-up')));
    act(() => screen.getByTestId('alerts-rule-save-alert-one').click());
    const rule = platform.store.getModuleState<AlertsState>('alerts').rules.find((r) => r.id === 'alert-one');
    expect(rule?.trigger).toMatchObject({
      kind: 'relativeChange',
      threshold: 5,
      direction: 'up',
      mode: 'PERCENT_CHANGE',
    });
  });

  it('settings band toggles enabled, badge channel, and throttled mode', () => {
    render(
      <GridProvider platform={platform}>
        <AlertsSettingsBand
          settings={platform.store.getModuleState<AlertsState>('alerts').settings}
          onChange={(fn) => {
            platform.store.setModuleState<AlertsState>('alerts', (s) => ({
              ...s,
              settings: fn(s.settings),
            }));
          }}
        />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('alerts-enabled-switch')));
    act(() => fireEvent.click(screen.getByTestId('alerts-channel-badge')));
    act(() => fireEvent.click(screen.getByTestId('alerts-mode-throttled')));
    const settings = platform.store.getModuleState<AlertsState>('alerts').settings;
    expect(settings.enabled).toBe(false);
    expect(settings.enabledChannels.badge).toBe(false);
    expect(settings.evaluationMode).toBe('throttled');
  });

  it('rule editor toggles per-rule channel and row removed trigger', async () => {
    const user = userEvent.setup();
    render(<MasterDetail platform={platform} />);
    await user.click(screen.getByTestId('alerts-trigger-rowChange-alert-one'));
    act(() => fireEvent.click(screen.getByTestId('alerts-row-removed-alert-one')));
    act(() => fireEvent.click(screen.getByTestId('alerts-rule-channel-toast-alert-one')));
    act(() => screen.getByTestId('alerts-rule-save-alert-one').click());
    const rule = platform.store.getModuleState<AlertsState>('alerts').rules.find((r) => r.id === 'alert-one');
    expect(rule?.trigger).toEqual({ kind: 'rowChange', event: 'ROW_REMOVED' });
    expect(rule?.channels).not.toContain('toast');
  });

  it('rule editor toggles enabled state and toast channel', () => {
    render(<MasterDetail platform={platform} />);
    act(() => fireEvent.click(screen.getByTestId('alerts-rule-enabled-alert-one')));
    act(() => fireEvent.click(screen.getByTestId('alerts-rule-channel-toast-alert-one')));
    act(() => screen.getByTestId('alerts-rule-save-alert-one').click());
    const rule = platform.store.getModuleState<AlertsState>('alerts').rules.find((r) => r.id === 'alert-one');
    expect(rule?.enabled).toBe(false);
    expect(rule?.channels).not.toContain('toast');
  });

  it('lists rules in the flat combined panel layout', () => {
    render(
      <GridProvider platform={platform}>
        <AlertsPanel />
      </GridProvider>,
    );
    expect(screen.getByTestId('alerts-panel')).toBeTruthy();
    expect(screen.getByTestId('alerts-rule-row-alert-one')).toBeTruthy();
  });

  it('global settings band adjusts default debounce slider', () => {
    render(
      <GridProvider platform={platform}>
        <AlertsSettingsBand
          settings={platform.store.getModuleState<AlertsState>('alerts').settings}
          onChange={(fn) => {
            platform.store.setModuleState<AlertsState>('alerts', (s) => ({
              ...s,
              settings: fn(s.settings),
            }));
          }}
        />
      </GridProvider>,
    );
    fireEvent.change(screen.getByTestId('alerts-debounce-input'), { target: { value: '250' } });
    expect(platform.store.getModuleState<AlertsState>('alerts').settings.defaultDebounceMs).toBe(250);
  });
});
