/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DataProviderConfig } from '@wellsfargo-starui/shared-types';
import { EditorForm } from './EditorForm.js';

const save = vi.fn(async (next: DataProviderConfig) => ({
  ...next,
  providerId: 'saved-1',
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({ configStore: { save, remove: vi.fn() } }),
}));

vi.mock('./providerConfigIo.js', () => ({
  exportProviderConfig: vi.fn(),
  parseProviderConfigImport: vi.fn(),
}));

vi.mock('./useProviderProbe.js', () => ({
  useProviderProbe: () => ({
    testing: false,
    testResult: null,
    inferring: false,
    inferredFields: [],
    inferenceSummary: null,
    inferenceError: null,
    test: vi.fn(),
    infer: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('./tabs/ConnectionTab.js', () => ({
  ConnectionTab: () => <div data-testid="connection-tab">connection</div>,
}));
vi.mock('./tabs/FieldsTab.js', () => ({
  FieldsTab: ({ onColumnsChange }: { onColumnsChange: (c: unknown[]) => void }) => (
    <button type="button" onClick={() => onColumnsChange([{ field: 'newField', headerName: 'New', cellDataType: 'text' }])}>
      stage-field
    </button>
  ),
}));
vi.mock('./tabs/ColumnsTab.js', () => ({
  ColumnsTab: () => <div data-testid="columns-tab">columns</div>,
}));
vi.mock('./tabs/DiagnosticsTab.js', () => ({
  DiagnosticsTab: () => <div data-testid="diagnostics-tab">diagnostics</div>,
}));
vi.mock('./transports/BehaviourFields.js', () => ({
  BehaviourFields: () => <div data-testid="behaviour-tab">behaviour</div>,
}));

import { exportProviderConfig } from './providerConfigIo.js';

const initial: DataProviderConfig = {
  providerId: undefined,
  name: 'Draft',
  providerType: 'mock',
  userId: 'dev',
  public: false,
  config: { providerType: 'mock', rowCount: 10, updateIntervalMs: 1000, enableUpdates: true },
};

afterEach(async () => {
  cleanup();
  save.mockClear();
  await act(async () => {
    await Promise.resolve();
  });
});

describe('EditorForm', () => {
  it('renders tabs and saves a new provider', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<EditorForm initial={initial} userId="dev" onSaved={onSaved} />);
    expect(screen.getByTestId('connection-tab')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Columns/i }));
    expect(screen.getByTestId('columns-tab')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Create DataProvider/i }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it('shows diagnostics only for saved providers', async () => {
    const user = userEvent.setup();
    render(
      <EditorForm
        initial={{ ...initial, providerId: 'p-1' }}
        userId="dev"
      />,
    );
    expect(screen.getByRole('tab', { name: /Diagnostics/i })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Diagnostics/i }));
    expect(screen.getByTestId('diagnostics-tab')).toBeInTheDocument();
  });

  it('surfaces save errors', async () => {
    save.mockRejectedValueOnce(new Error('disk full'));
    const user = userEvent.setup();
    render(<EditorForm initial={initial} userId="dev" />);
    await user.click(screen.getByRole('button', { name: /Create DataProvider/i }));
    await waitFor(() => expect(screen.getByText(/disk full/i)).toBeInTheDocument());
  });

  it('invokes cancel and clone callbacks', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onClone = vi.fn();
    render(
      <EditorForm
        initial={{ ...initial, providerId: 'p-1' }}
        userId="dev"
        onCancel={onCancel}
        onClone={onClone}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Duplicate/i }));
    expect(onClone).toHaveBeenCalled();
  });

  it('exports the working provider config', async () => {
    const user = userEvent.setup();
    render(<EditorForm initial={{ ...initial, providerId: 'p-1' }} userId="dev" />);
    await user.click(screen.getByRole('button', { name: /^Export$/i }));
    expect(exportProviderConfig).toHaveBeenCalled();
  });

  it('commits staged field selections via Update Columns', async () => {
    const user = userEvent.setup();
    render(<EditorForm initial={initial} userId="dev" />);
    await user.click(screen.getByRole('tab', { name: /Fields/i }));
    await user.click(screen.getByRole('button', { name: 'stage-field' }));
    await user.click(screen.getByRole('button', { name: /Update Columns/i }));
    await user.click(screen.getByRole('button', { name: /Create DataProvider/i }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('uses a single connection pane for appdata providers', () => {
    render(
      <EditorForm
        initial={{
          ...initial,
          providerType: 'appdata',
          config: { providerType: 'appdata', variables: {} },
        }}
        userId="dev"
      />,
    );
    expect(screen.getByTestId('connection-tab')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Fields/i })).not.toBeInTheDocument();
  });

  it('updates an existing provider and edits header metadata', async () => {
    const user = userEvent.setup();
    render(
      <EditorForm
        initial={{ ...initial, providerId: 'p-1', name: 'Saved', description: 'old' }}
        userId="dev"
      />,
    );
    await user.clear(screen.getByPlaceholderText('positions-live'));
    await user.type(screen.getByPlaceholderText('positions-live'), 'Renamed');
    await user.type(screen.getByPlaceholderText(/What this provider streams/i), ' updated');
    await user.click(screen.getByRole('switch', { name: /Public/i }));
    await user.click(screen.getByRole('button', { name: /Update DataProvider/i }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Renamed', public: true }),
      'dev',
    ));
  });

  it('opens the behaviour tab for non-appdata providers', async () => {
    const user = userEvent.setup();
    render(<EditorForm initial={initial} userId="dev" />);
    await user.click(screen.getByRole('tab', { name: /Behaviour/i }));
    expect(screen.getByTestId('behaviour-tab')).toBeInTheDocument();
  });
});
