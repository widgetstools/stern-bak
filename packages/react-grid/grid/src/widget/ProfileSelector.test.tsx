import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RESERVED_DEFAULT_PROFILE_ID } from '@wellsfargo-starui/core';
import { ProfileSelector, type ProfileSelectorProps } from './ProfileSelector';

function makeProps(overrides: Partial<ProfileSelectorProps> = {}): ProfileSelectorProps {
  return {
    profiles: [
      { id: RESERVED_DEFAULT_PROFILE_ID, name: 'Default', updatedAt: 1 },
      { id: 'trader', name: 'Trader', updatedAt: 2 },
    ],
    activeProfileId: RESERVED_DEFAULT_PROFILE_ID,
    isDirty: false,
    onCreate: vi.fn(),
    onLoad: vi.fn(),
    onDelete: vi.fn(),
    onClone: vi.fn(),
    onRename: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    ...overrides,
  };
}

describe('ProfileSelector', () => {
  it('shows the active profile name on the trigger', () => {
    render(<ProfileSelector {...makeProps()} />);
    expect(screen.getByTestId('profile-selector-trigger')).toHaveTextContent('Default');
  });

  it('loads a profile when a row is clicked', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ProfileSelector {...props} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    await user.click(screen.getByTestId('profile-row-trader'));
    expect(props.onLoad).toHaveBeenCalledWith('trader');
  });

  it('creates a new profile from the footer input', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ProfileSelector {...props} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    await user.type(screen.getByTestId('profile-name-input'), 'New layout');
    await user.click(screen.getByTestId('profile-create-btn'));
    expect(props.onCreate).toHaveBeenCalledWith('New layout');
  });

  it('exports the active profile from the footer action', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ProfileSelector {...props} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    await user.click(screen.getByTestId('profile-export-active-btn'));
    expect(props.onExport).toHaveBeenCalledWith(RESERVED_DEFAULT_PROFILE_ID);
  });

  it('confirms delete via AlertDialog', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ProfileSelector {...props} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    const deleteButtons = screen.getAllByLabelText(/Delete layout/);
    await user.click(deleteButtons.find((el) => el.closest('[data-testid="profile-row-trader"]')) ?? deleteButtons[0]);
    await user.click(screen.getByTestId('profile-delete-confirm-btn'));
    expect(props.onDelete).toHaveBeenCalledWith('trader');
  });

  it('inline-renames a non-default profile', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ProfileSelector {...props} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    await user.click(screen.getByTestId('profile-rename-trader'));
    const input = screen.getByTestId('profile-rename-input-trader');
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');
    await waitFor(() => expect(props.onRename).toHaveBeenCalledWith('trader', 'Renamed'));
  });

  it('calls onClone when clone button clicked', async () => {
    const onClone = vi.fn().mockResolvedValue({ id: 'clone-1', name: 'Trader copy', updatedAt: 3 });
    render(<ProfileSelector {...makeProps({ onClone })} />);

    fireEvent.click(screen.getByTestId('profile-selector-trigger'));
    await waitFor(() => expect(screen.getByTestId('profile-clone-trader')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('profile-clone-trader'));
    });
    await waitFor(() => expect(onClone).toHaveBeenCalledWith('trader'));
  });

  it('imports a profile from the hidden file input', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(<ProfileSelector {...makeProps({ onImport })} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    const input = screen.getByTestId('profile-import-file');
    const file = new File(['{"profile":{"name":"Imported"}}'], 'profile.json', { type: 'application/json' });
    await user.upload(input, file);
    expect(onImport).toHaveBeenCalledWith(file);
  });

  it('cancels inline rename with Escape', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<ProfileSelector {...makeProps({ onRename })} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    await user.click(screen.getByTestId('profile-rename-trader'));
    const input = screen.getByTestId('profile-rename-input-trader');
    await user.type(input, 'Changed');
    await user.keyboard('{Escape}');
    expect(onRename).not.toHaveBeenCalled();
  });

  it('shows fallback label and dirty indicator when active profile missing', () => {
    render(
      <ProfileSelector
        {...makeProps({
          profiles: [],
          activeProfileId: 'missing',
          isDirty: true,
        })}
      />,
    );
    const trigger = screen.getByTestId('profile-selector-trigger');
    expect(trigger).toHaveTextContent('No layout');
    expect(trigger).toHaveAttribute('title', 'Select or create a layout');
  });

  it('shows unsaved title on trigger when dirty', () => {
    render(<ProfileSelector {...makeProps({ isDirty: true })} />);
    expect(screen.getByTestId('profile-selector-trigger')).toHaveAttribute(
      'title',
      'Default (unsaved changes)',
    );
  });

  it('renders empty list hint when no profiles exist', async () => {
    const user = userEvent.setup();
    render(
      <ProfileSelector
        {...makeProps({
          profiles: [],
          activeProfileId: '',
          onClone: undefined,
          onRename: undefined,
          onExport: undefined,
          onImport: undefined,
        })}
      />,
    );
    await user.click(screen.getByTestId('profile-selector-trigger'));
    expect(screen.getByText(/No layouts yet/)).toBeInTheDocument();
  });

  it('loads a profile when Enter is pressed on a row', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ProfileSelector {...props} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    fireEvent.keyDown(screen.getByTestId('profile-row-trader'), { key: 'Enter' });
    expect(props.onLoad).toHaveBeenCalledWith('trader');
  });

  it('skips rename when name is unchanged on blur', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<ProfileSelector {...makeProps({ onRename })} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    await user.click(screen.getByTestId('profile-rename-trader'));
    await user.tab();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('warns when rename fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onRename = vi.fn().mockRejectedValue(new Error('fail'));
    render(<ProfileSelector {...makeProps({ onRename })} />);

    fireEvent.click(screen.getByTestId('profile-selector-trigger'));
    fireEvent.click(screen.getByTestId('profile-rename-trader'));
    const input = screen.getByTestId('profile-rename-input-trader');
    fireEvent.change(input, { target: { value: 'Broken' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('trader', 'Broken'));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('enters inline rename after clone when host omits return value', async () => {
    const onClone = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <ProfileSelector
        {...makeProps({
          onClone,
          activeProfileId: RESERVED_DEFAULT_PROFILE_ID,
        })}
      />,
    );

    fireEvent.click(screen.getByTestId('profile-selector-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('profile-clone-trader'));
    });
    await waitFor(() => expect(onClone).toHaveBeenCalledWith('trader'));

    rerender(
      <ProfileSelector
        {...makeProps({
          onClone,
          activeProfileId: 'clone-trader',
          profiles: [
            { id: RESERVED_DEFAULT_PROFILE_ID, name: 'Default', updatedAt: 1 },
            { id: 'clone-trader', name: 'Trader copy', updatedAt: 3 },
          ],
        })}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('profile-rename-input-clone-trader')).toBeInTheDocument();
    });
  });

  it('clears clone rename state when clone fails', async () => {
    const onClone = vi.fn().mockRejectedValue(new Error('clone failed'));
    render(<ProfileSelector {...makeProps({ onClone })} />);

    fireEvent.click(screen.getByTestId('profile-selector-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('profile-clone-trader'));
    });
    await waitFor(() => expect(onClone).toHaveBeenCalled());
    expect(screen.queryByTestId('profile-rename-input-trader')).toBeNull();
  });

  it('cancels inline rename via cancel button', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<ProfileSelector {...makeProps({ onRename })} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    await user.click(screen.getByTestId('profile-rename-trader'));
    await user.click(screen.getByTestId('profile-rename-cancel-trader'));
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByTestId('profile-rename-input-trader')).toBeNull();
  });

  it('exports a specific profile from the row action', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<ProfileSelector {...makeProps({ onExport })} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    await user.click(screen.getByTestId('profile-export-trader'));
    expect(onExport).toHaveBeenCalledWith('trader');
  });

  it('cancels delete from AlertDialog', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<ProfileSelector {...makeProps({ onDelete })} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    const deleteButtons = screen.getAllByLabelText(/Delete layout/);
    await user.click(deleteButtons.find((el) => el.closest('[data-testid="profile-row-trader"]')) ?? deleteButtons[0]);
    await user.click(screen.getByTestId('profile-delete-cancel'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('clears create input on Escape', async () => {
    const user = userEvent.setup();
    render(<ProfileSelector {...makeProps()} />);

    await user.click(screen.getByTestId('profile-selector-trigger'));
    const input = screen.getByTestId('profile-name-input');
    await user.type(input, 'Draft');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
  });
});
