import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RESERVED_DEFAULT_PROFILE_ID } from '@wellsfargo-starui/core';
import { ProfileSelector, type ProfileSelectorProps } from './ProfileSelector';

function makeProps(overrides: Partial<ProfileSelectorProps> = {}): ProfileSelectorProps {
  return {
    profiles: [
      { id: RESERVED_DEFAULT_PROFILE_ID, name: 'Default', createdAt: 1, updatedAt: 1, isDefault: true, isTemplate: true },
      { id: 'trader', name: 'Trader', createdAt: 2, updatedAt: 2, isDefault: false, isTemplate: true },
      { id: 'mine', name: 'Mine', createdAt: 3, updatedAt: 3, isDefault: false, isTemplate: false },
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

describe('ProfileSelector — template layouts', () => {
  it('flags template rows and hides rename / delete on them in a launched instance', async () => {
    const user = userEvent.setup();
    render(<ProfileSelector {...makeProps()} />);
    await user.click(screen.getByTestId('profile-selector-trigger'));

    expect(screen.getByTestId('profile-row-trader')).toHaveAttribute('data-template', 'true');
    expect(screen.getByTestId('profile-template-trader')).toBeInTheDocument();
    expect(screen.getByTestId('profile-row-mine')).not.toHaveAttribute('data-template');
    expect(screen.queryByTestId('profile-template-mine')).toBeNull();

    // Read-only template: no rename, no delete; clone and export stay.
    expect(screen.queryByTestId('profile-rename-trader')).toBeNull();
    expect(screen.queryByLabelText('Delete layout Trader')).toBeNull();
    expect(screen.getByTestId('profile-clone-trader')).toBeInTheDocument();
    expect(screen.getByTestId('profile-export-trader')).toBeInTheDocument();
    // A plain profile keeps its rename + delete.
    expect(screen.getByTestId('profile-rename-mine')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete layout Mine')).toBeInTheDocument();
  });

  it('tells the user a save on a template lands on the copy', async () => {
    const user = userEvent.setup();
    render(<ProfileSelector {...makeProps()} />);
    await user.click(screen.getByTestId('profile-selector-trigger'));
    expect(screen.getByTestId('profile-template-trader')).toHaveAttribute('title', expect.stringContaining('creates a copy'));
    expect(screen.getByTitle('Trader — template layout; saving lands on "Trader (copy)"')).toBeInTheDocument();
  });

  it('keeps template rows editable while authoring in Workspace Setup', async () => {
    const user = userEvent.setup();
    render(<ProfileSelector {...makeProps({ templateAuthoring: true })} />);
    await user.click(screen.getByTestId('profile-selector-trigger'));

    expect(screen.getByTestId('profile-row-trader')).toHaveAttribute('data-template', 'true');
    expect(screen.getByTestId('profile-rename-trader')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete layout Trader')).toBeInTheDocument();
    expect(screen.getByTestId('profile-template-trader')).toHaveAttribute('title', 'Template layout');
  });
});
