/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DataProviderConfig } from '@wellsfargo-starui/types/shared';
import {
  ProviderGridHostProvider,
  type ProviderGridHostApi,
} from '../../providerGridHost/ProviderGridHostContext';
import { ProviderGridHostSection } from './ProviderGridHostSection';

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

function makeHost(over: Partial<ProviderGridHostApi> = {}): ProviderGridHostApi {
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

const baseDraft = {
  liveProviderId: 'live-1' as string | null,
  historicalProviderId: 'hist-1' as string | null,
  mode: 'live' as const,
  asOfDate: null as string | null,
};

function mount(
  host: ProviderGridHostApi,
  draft = baseDraft,
  onDraftChange = vi.fn(),
) {
  return {
    onDraftChange,
    ...render(
      <ProviderGridHostProvider value={host}>
        <ProviderGridHostSection draft={draft} onDraftChange={onDraftChange} />
      </ProviderGridHostProvider>,
    ),
  };
}

describe('ProviderGridHostSection', () => {
  it('shows unavailable message when host is not wired', () => {
    render(
      <ProviderGridHostProvider value={{ ...makeHost(), available: false }}>
        <ProviderGridHostSection draft={baseDraft} onDraftChange={vi.fn()} />
      </ProviderGridHostProvider>,
    );
    expect(screen.getByText(/MarketsGridContainer/i)).toBeTruthy();
  });

  it('stages mode changes without calling host callbacks', () => {
    const host = makeHost();
    const onDraftChange = vi.fn();
    mount(host, baseDraft, onDraftChange);

    fireEvent.click(within(screen.getByTestId('provider-mode-toggle')).getByRole('button', { name: 'Hist' }));
    expect(onDraftChange).toHaveBeenCalledWith({ mode: 'historical' });
    expect(host.onModeChange).not.toHaveBeenCalled();
  });

  it('fires imperative refresh/reload/edit actions immediately', () => {
    const host = makeHost();
    mount(host);

    fireEvent.click(screen.getByTestId('provider-refresh-view'));
    fireEvent.click(screen.getByTestId('provider-reload-from-source'));
    fireEvent.click(screen.getByTestId('provider-edit-selected'));

    expect(host.onRefreshView).toHaveBeenCalled();
    expect(host.onReloadFromSource).toHaveBeenCalled();
    expect(host.onEditProvider).toHaveBeenCalledWith('live-1');
  });

  it('stages historical as-of date when mode is historical', () => {
    const onDraftChange = vi.fn();
    mount(makeHost(), {
      ...baseDraft,
      mode: 'historical',
      historicalProviderId: 'hist-1',
      asOfDate: '2024-06-01',
    }, onDraftChange);
    expect(screen.getByTestId('provider-asof-date')).toBeTruthy();
    expect(screen.getByText('2024-06-01')).toBeTruthy();
  });

  it('stages live provider selection via select', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const host = makeHost({
      liveProviders: [provider('live-1', 'Live One'), provider('live-2', 'Live Two')],
    });
    mount(host, { ...baseDraft, liveProviderId: 'live-1' }, onDraftChange);
    const triggers = screen.getAllByTestId('provider-live-select');
    await user.click(triggers[triggers.length - 1]!);
    await user.click(await screen.findByRole('option', { name: /Live Two/i }));
    expect(onDraftChange).toHaveBeenCalledWith({ liveProviderId: 'live-2' });
  });

  it('hideSectionHeader suppresses the section label', () => {
    render(
      <ProviderGridHostProvider value={makeHost()}>
        <ProviderGridHostSection
          hideSectionHeader
          draft={baseDraft}
          onDraftChange={vi.fn()}
        />
      </ProviderGridHostProvider>,
    );
    expect(screen.queryByText('DATA PROVIDER')).toBeNull();
    expect(screen.getByTestId('provider-grid-host-section')).toBeTruthy();
  });

  it('stages historical provider selection', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    mount(makeHost(), { ...baseDraft, mode: 'historical', historicalProviderId: 'hist-1' }, onDraftChange);
    const triggers = screen.getAllByTestId('provider-hist-select');
    await user.click(triggers[triggers.length - 1]!);
    await user.click(await screen.findByRole('option', { name: /— None —/i }));
    expect(onDraftChange).toHaveBeenCalledWith({ historicalProviderId: null });
  });

  it('  edit provider uses historical id in historical mode', () => {
    const host = makeHost();
    mount(host, { ...baseDraft, mode: 'historical', historicalProviderId: 'hist-1' });
    fireEvent.click(screen.getByTestId('provider-edit-selected'));
    expect(host.onEditProvider).toHaveBeenCalledWith('hist-1');
  });

  it('disables live mode when no live provider is selected', () => {
    mount(makeHost(), { ...baseDraft, liveProviderId: null });
    expect(
      within(screen.getByTestId('provider-mode-toggle')).getByRole('button', { name: 'Live' }),
    ).toHaveProperty('disabled', true);
  });

  it('disables historical provider row when no historical providers exist', () => {
    mount(makeHost({ historicalProviders: [] }), { ...baseDraft, historicalProviderId: null });
    expect(screen.getAllByTestId('provider-hist-select').at(-1)).toHaveProperty('disabled', true);
  });

  it('shows pick-a-date placeholder in historical mode', () => {
    mount(makeHost(), {
      ...baseDraft,
      mode: 'historical',
      historicalProviderId: 'hist-1',
      asOfDate: null,
    });
    expect(screen.getByText('Pick a date')).toBeTruthy();
  });

  it('disables edit when no active provider is selected', () => {
    mount(makeHost(), { ...baseDraft, liveProviderId: null, historicalProviderId: null });
    expect((screen.getByTestId('provider-edit-selected') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders existing as-of date label for valid ISO input', () => {
    mount(makeHost(), {
      ...baseDraft,
      mode: 'historical',
      historicalProviderId: 'hist-1',
      asOfDate: '2024-01-15',
    });
    expect(screen.getByText('2024-01-15')).toBeTruthy();
  });

  it('handles malformed as-of ISO without crashing', () => {
    mount(makeHost(), {
      ...baseDraft,
      mode: 'historical',
      historicalProviderId: 'hist-1',
      asOfDate: '2024-00-15',
    });
    expect(screen.getByTestId('provider-asof-date')).toBeTruthy();
  });
});
