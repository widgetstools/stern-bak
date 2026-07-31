import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RESERVED_DEFAULT_PROFILE_ID } from '@wellsfargo-starui/engine';
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
});
