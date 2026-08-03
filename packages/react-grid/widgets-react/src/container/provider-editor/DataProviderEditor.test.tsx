/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProviderEditor } from './DataProviderEditor.js';

const configs = [
  {
    providerId: 'p1',
    name: 'Live STOMP',
    providerType: 'stomp' as const,
    userId: 'dev',
    public: false,
    config: { providerType: 'stomp' as const, websocketUrl: 'ws://x', listenerTopic: '/t' },
  },
];

const save = vi.fn().mockResolvedValue({ providerId: 'saved-1' });
const remove = vi.fn().mockResolvedValue(undefined);
const refresh = vi.fn();

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({ configStore: { save, remove } }),
  useDataProvidersList: () => ({
    configs,
    loading: false,
    refresh,
  }),
}));

const lastDraft: { current: any } = { current: null };

vi.mock('./EditorForm.js', () => ({
  EditorForm: (props: { initial: { name: string }; onCancel?: () => void }) => {
    lastDraft.current = props.initial;
    return <div data-testid="editor-form">{props.initial.name}</div>;
  },
}));

vi.mock('./providerConfigIo.js', () => ({
  parseProviderConfigImport: vi.fn(() => ({
    name: 'Imported',
    providerType: 'mock',
    config: { providerType: 'mock' },
  })),
}));

afterEach(() => {
  cleanup();
  remove.mockClear();
  save.mockClear();
  refresh.mockClear();
});

describe('DataProviderEditor', () => {
  it('lists providers and opens the selected form', async () => {
    const user = userEvent.setup();
    render(<DataProviderEditor userId="dev" initialProviderId="p1" />);
    await waitFor(() => expect(screen.getByTestId('editor-form')).toHaveTextContent('Live STOMP'));
    await user.click(screen.getByRole('button', { name: /New/i }));
    await user.click(await screen.findByRole('button', { name: /^Create$/i }));
    expect(screen.getByTestId('editor-form')).toHaveTextContent('untitled');
  });

  it('filters the sidebar with search', async () => {
    const user = userEvent.setup();
    render(<DataProviderEditor userId="dev" />);
    expect(screen.getByRole('button', { name: /Live STOMP/i })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Search…'), 'zzz');
    expect(screen.queryByRole('button', { name: /Live STOMP/i })).not.toBeInTheDocument();
  });

  it('deletes a saved provider after confirmation', async () => {
    const user = userEvent.setup();
    render(<DataProviderEditor userId="dev" initialProviderId="p1" />);
    await user.click(screen.getByTitle('Delete'));
    await user.click(await screen.findByRole('button', { name: /^Delete$/i }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('p1'));
    expect(refresh).toHaveBeenCalled();
  });

  it('imports a provider JSON file as a new saved row', async () => {
    save.mockResolvedValueOnce({ providerId: 'imported-1', name: 'Imported', providerType: 'mock', config: { providerType: 'mock' } });
    render(<DataProviderEditor userId="dev" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File(['{}'], 'provider.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it('clones an existing provider into a new draft', async () => {
    const user = userEvent.setup();
    render(<DataProviderEditor userId="dev" initialProviderId="p1" />);
    await user.click(screen.getByTitle('Duplicate'));
    expect(screen.getByTestId('editor-form')).toHaveTextContent('Live STOMP (copy)');
  });

  it('surfaces delete failures', async () => {
    remove.mockRejectedValueOnce(new Error('locked'));
    const user = userEvent.setup();
    render(<DataProviderEditor userId="dev" initialProviderId="p1" />);
    await user.click(screen.getByTitle('Delete'));
    await user.click(await screen.findByRole('button', { name: /^Delete$/i }));
    await waitFor(() => expect(screen.getByText(/locked/i)).toBeInTheDocument());
  });

  /**
   * Both types held meta but were held OUT of the create list while no
   * transport-fields component existed. They have one now, so they are
   * offerable — and a draft has to arrive usable, because these two carry
   * settings whose defaults are not merely convenient but load-bearing.
   */
  describe('creating a Perspective provider', () => {
    const create = async (label: RegExp) => {
      const user = userEvent.setup();
      render(<DataProviderEditor userId="dev" />);
      await user.click(screen.getByRole('button', { name: /^New$/i }));
      await user.click(await screen.findByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: label }));
      await user.click(screen.getByRole('button', { name: /^Create$/i }));
      return lastDraft.current;
    };

    it('offers stomp-perspective and seeds a working draft', async () => {
      const draft = await create(/^STOMP \(Perspective\)$/);

      expect(draft.providerType).toBe('stomp-perspective');
      expect(draft.config).toMatchObject({
        providerType: 'stomp-perspective',
        inferDates: true,
        integerColumns: [],
        snapshotEndToken: 'Success',
      });
    });

    it('offers mock-perspective and seeds a draft whose rows can reach a Table', async () => {
      const draft = await create(/^Mock \(Perspective\)$/);

      expect(draft.providerType).toBe('mock-perspective');
      // Flat is not a nicety here: a Perspective schema is a flat map of typed
      // columns, so a nested row populates nothing.
      expect(draft.config).toMatchObject({
        providerType: 'mock-perspective',
        rowShape: 'flat',
        inferDates: true,
        integerColumns: [],
      });
    });
  });

  it('cancels delete confirmation without removing the provider', async () => {
    const user = userEvent.setup();
    render(<DataProviderEditor userId="dev" initialProviderId="p1" />);
    await user.click(screen.getByTitle('Delete'));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(remove).not.toHaveBeenCalled();
  });
});
