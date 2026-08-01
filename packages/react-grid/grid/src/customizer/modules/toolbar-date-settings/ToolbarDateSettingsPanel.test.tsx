/**
 * Custom Settings panel — explicit-Save behaviour for the staged sections.
 *
 * Section 02 (Data Provider) and section 03 (Event Callbacks) historically
 * applied changes to their grid-level hosts immediately. They now stage edits
 * and apply ONLY on the panel's Save; Reset reverts. Imperative actions
 * (Refresh / Reload / Edit) stay immediate and are not covered here.
 *
 * The MODE toggle is plain buttons (deterministic in jsdom), so it drives the
 * staging assertions without Radix Select pointer plumbing.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/engine';
import type { DataProviderConfig } from '@wellsfargo-starui/shared-types';
import { GridProvider } from '../../hooks/GridProvider';
import {
  ProviderGridHostProvider,
  type ProviderGridHostApi,
} from '../../providerGridHost/ProviderGridHostContext';
import {
  GridEventBindingsHostProvider,
  type GridEventBindingsHostApi,
} from '../../gridEventBindingsHost/GridEventBindingsHostContext';
import { toolbarDateSettingsModule } from './index';
import { ToolbarDateSettingsPanel } from './ToolbarDateSettingsPanel';

function provider(id: string, name: string): DataProviderConfig {
  return {
    providerId: id,
    name,
    providerType: 'stomp',
    userId: 'dev',
    public: false,
    config: { providerType: 'stomp' },
  } as DataProviderConfig;
}

function makeProviderHost(over: Partial<ProviderGridHostApi> = {}): ProviderGridHostApi {
  return {
    available: true,
    liveProviders: [provider('live-1', 'Live One')],
    historicalProviders: [provider('hist-1', 'Hist One')],
    liveProviderId: 'live-1',
    historicalProviderId: 'hist-1',
    mode: 'live',
    asOfDate: null,
    onLiveChange: vi.fn(),
    onHistoricalChange: vi.fn(),
    onModeChange: vi.fn(),
    onAsOfDateChange: vi.fn(),
    onRefreshView: vi.fn(),
    onReloadFromSource: vi.fn(),
    onEditProvider: vi.fn(),
    ...over,
  };
}

function makeBindingsHost(over: Partial<GridEventBindingsHostApi> = {}): GridEventBindingsHostApi {
  return {
    available: true,
    bindings: {},
    catalog: [],
    handlerIds: [],
    setBindings: vi.fn(),
    setEventHandler: vi.fn(),
    ...over,
  };
}

function mount(providerHost: ProviderGridHostApi, bindingsHost: GridEventBindingsHostApi) {
  const platform = new GridPlatform({
    gridId: 'test-grid',
    modules: [toolbarDateSettingsModule],
  });
  return render(
    <GridProvider platform={platform}>
      <ProviderGridHostProvider value={providerHost}>
        <GridEventBindingsHostProvider value={bindingsHost}>
          <ToolbarDateSettingsPanel />
        </GridEventBindingsHostProvider>
      </ProviderGridHostProvider>
    </GridProvider>,
  );
}

function saveBtn(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
}
function resetBtn(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement;
}
/** The MODE 'Hist' button, scoped to its row (the name is ambiguous panel-wide). */
function histModeBtn(): HTMLButtonElement {
  return within(screen.getByTestId('provider-mode-toggle')).getByRole('button', {
    name: 'Hist',
  }) as HTMLButtonElement;
}

describe('Custom Settings panel — explicit Save', () => {
  let providerHost: ProviderGridHostApi;
  let bindingsHost: GridEventBindingsHostApi;
  beforeEach(() => {
    providerHost = makeProviderHost();
    bindingsHost = makeBindingsHost();
  });

  it('starts clean — Save and Reset are disabled', () => {
    mount(providerHost, bindingsHost);
    expect(saveBtn().disabled).toBe(true);
    expect(resetBtn().disabled).toBe(true);
  });

  it('staging a MODE change does NOT apply to the host until Save', () => {
    mount(providerHost, bindingsHost);

    fireEvent.click(histModeBtn());

    // Staged only — host untouched, but the panel is now dirty.
    expect(providerHost.onModeChange).not.toHaveBeenCalled();
    expect(saveBtn().disabled).toBe(false);

    fireEvent.click(saveBtn());
    expect(providerHost.onModeChange).toHaveBeenCalledWith('historical');
  });

  it('Reset reverts the staged MODE without touching the host', () => {
    mount(providerHost, bindingsHost);

    fireEvent.click(histModeBtn());
    expect(saveBtn().disabled).toBe(false);

    fireEvent.click(resetBtn());

    expect(providerHost.onModeChange).not.toHaveBeenCalled();
    // Back to clean → buttons disabled again.
    expect(saveBtn().disabled).toBe(true);
  });

  it('Save only applies fields that actually changed', () => {
    mount(providerHost, bindingsHost);

    fireEvent.click(histModeBtn());
    fireEvent.click(saveBtn());

    // Mode changed → applied; untouched selections are not re-applied.
    expect(providerHost.onModeChange).toHaveBeenCalledTimes(1);
    expect(providerHost.onLiveChange).not.toHaveBeenCalled();
    expect(providerHost.onHistoricalChange).not.toHaveBeenCalled();
    // Bindings unchanged → host not asked to replace the map.
    expect(bindingsHost.setBindings).not.toHaveBeenCalled();
  });

  it('staging an event binding does NOT apply to the host until Save', async () => {
    const user = userEvent.setup();
    bindingsHost = makeBindingsHost({
      handlerIds: ['logEvent'],
      handlerMeta: { logEvent: { label: 'Log to console' } },
    });
    mount(providerHost, bindingsHost);

    await user.click(screen.getByTestId('grid-event-handler-select-grid:ready'));
    await user.click(await screen.findByRole('option', { name: 'Log to console' }));
    expect(bindingsHost.setBindings).not.toHaveBeenCalled();
    expect(saveBtn().disabled).toBe(false);

    fireEvent.click(saveBtn());
    expect(bindingsHost.setBindings).toHaveBeenCalled();
  });

  it('renders panel shell with section navigation', () => {
    mount(providerHost, bindingsHost);
    expect(screen.getByTestId('toolbar-date-settings-panel')).toBeTruthy();
    expect(screen.getByTestId('tds-section-nav')).toBeTruthy();
  });

  it('navigates between sections via sidebar buttons', () => {
    mount(providerHost, bindingsHost);
    fireEvent.click(screen.getByTestId('tds-nav-02'));
    expect(screen.getByTestId('provider-grid-host-section')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tds-nav-04'));
    expect(screen.getByTestId('tds-row-filter-section')).toBeTruthy();
  });

  it('staging toolbar-date enabled toggle dirties Save', () => {
    mount(providerHost, bindingsHost);
    fireEvent.click(screen.getByTestId('tds-enabled-switch'));
    expect(saveBtn().disabled).toBe(false);
    fireEvent.click(saveBtn());
    expect(saveBtn().disabled).toBe(true);
  });

  it('row filter example inserts expression and clear resets it', () => {
    mount(providerHost, bindingsHost);
    fireEvent.click(screen.getByTestId('tds-nav-04'));
    fireEvent.click(screen.getAllByTestId('tds-row-filter-example')[0]!);
    expect(saveBtn().disabled).toBe(false);
    fireEvent.click(screen.getByTestId('tds-row-filter-clear'));
    fireEvent.click(resetBtn());
    expect(saveBtn().disabled).toBe(true);
  });

  it('shows row filter validation error for malformed expression', () => {
    mount(providerHost, bindingsHost);
    fireEvent.click(screen.getByTestId('tds-nav-04'));
    fireEvent.change(screen.getByTestId('tds-row-filter-editor'), { target: { value: '[price] >' } });
    expect(screen.getByTestId('tds-row-filter-error')).toBeTruthy();
  });

  it('discard resets staged provider and bindings without applying', () => {
    mount(providerHost, bindingsHost);
    fireEvent.click(histModeBtn());
    fireEvent.click(resetBtn());
    expect(providerHost.onModeChange).not.toHaveBeenCalled();
    expect(saveBtn().disabled).toBe(true);
  });

  it('Save applies live provider change when staged', async () => {
    const user = userEvent.setup();
    providerHost = makeProviderHost({
      liveProviders: [provider('live-1', 'Live One'), provider('live-2', 'Live Two')],
    });
    mount(providerHost, bindingsHost);
    fireEvent.click(screen.getByTestId('tds-nav-02'));
    const triggers = screen.getAllByTestId('provider-live-select');
    await user.click(triggers[triggers.length - 1]!);
    await user.click(await screen.findByRole('option', { name: /Live Two/i }));
    fireEvent.click(saveBtn());
    expect(providerHost.onLiveChange).toHaveBeenCalledWith('live-2');
  });

  it('navigates toolbar date and event callback sections', () => {
    bindingsHost = makeBindingsHost({
      handlerIds: ['logEvent'],
      handlerMeta: { logEvent: { label: 'Log to console' } },
    });
    mount(providerHost, bindingsHost);
    fireEvent.click(screen.getByTestId('tds-nav-01'));
    expect(screen.getByTestId('toolbar-date-appdata-section')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tds-nav-03'));
    expect(screen.getByTestId('grid-event-handler-select-grid:ready')).toBeTruthy();
  });
});
