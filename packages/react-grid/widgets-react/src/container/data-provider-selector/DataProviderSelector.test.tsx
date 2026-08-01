import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProviderSelector } from './DataProviderSelector.js';

const configs = [
  {
    providerId: 'p1',
    name: 'Alpha Feed',
    providerType: 'stomp' as const,
    userId: 'system',
    public: true,
    config: { providerType: 'stomp' as const },
  },
  {
    providerId: 'p2',
    name: 'Beta Feed',
    providerType: 'rest' as const,
    userId: 'dev',
    public: false,
    config: { providerType: 'rest' as const },
  },
];

vi.mock('@wellsfargo-starui/host-data-react/runtime', () => ({
  useDataProvidersList: vi.fn(() => ({
    configs,
    loading: false,
    refresh: vi.fn(),
  })),
}));

import { useDataProvidersList } from '@wellsfargo-starui/host-data-react/runtime';

afterEach(() => {
  cleanup();
  vi.mocked(useDataProvidersList).mockReturnValue({
    configs,
    loading: false,
    refresh: vi.fn(),
  });
});

describe('DataProviderSelector', () => {
  it('selects a provider in dropdown mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DataProviderSelector value={null} onChange={onChange} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Alpha Feed/i }));
    expect(onChange).toHaveBeenCalledWith('p1');
  });

  it('filters by subtype', () => {
    render(<DataProviderSelector value={null} onChange={vi.fn()} subtype="rest" />);
    expect(useDataProvidersList).toHaveBeenCalledWith({ subtype: 'rest' });
  });

  it('shows loading spinner in list mode', () => {
    vi.mocked(useDataProvidersList).mockReturnValue({
      configs: [],
      loading: true,
      refresh: vi.fn(),
    });
    render(<DataProviderSelector value={null} onChange={vi.fn()} mode="list" />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('invokes onEdit for the selected row in list mode', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <DataProviderSelector value="p1" onChange={vi.fn()} mode="list" onEdit={onEdit} />,
    );
    await user.click(screen.getByTitle('Edit'));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'p1' }));
  });

  it('clears selection via the none option in dropdown mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DataProviderSelector value="p1" onChange={onChange} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /None/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows empty-state messaging and create affordance in list mode', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    vi.mocked(useDataProvidersList).mockReturnValue({
      configs: [],
      loading: false,
      refresh: vi.fn(),
    });
    render(
      <DataProviderSelector value={null} onChange={vi.fn()} mode="list" subtype="rest" onCreate={onCreate} />,
    );
    expect(screen.getByText(/REST providers configured/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Create your first/i }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('refreshes the provider list from list mode', async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    vi.mocked(useDataProvidersList).mockReturnValue({
      configs,
      loading: false,
      refresh,
    });
    render(<DataProviderSelector value={null} onChange={vi.fn()} mode="list" />);
    await user.click(screen.getByTitle('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows list errors and wires create in dropdown mode', async () => {
    const onCreate = vi.fn();
    vi.mocked(useDataProvidersList).mockReturnValue({
      configs: [],
      loading: false,
      error: 'catalog down',
      refresh: vi.fn(),
    });
    render(<DataProviderSelector value={null} onChange={vi.fn()} onCreate={onCreate} />);
    expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
  });
});
