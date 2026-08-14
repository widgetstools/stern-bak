import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyModule } from '@wellsfargo-starui/core';
import { SettingsModuleMenubar } from './SettingsModuleMenubar';

function mod(id: string, category: string | undefined, name = id): AnyModule {
  return { id, name, category } as AnyModule;
}

describe('SettingsModuleMenubar — RTL', () => {
  const modules = [
    mod('general-settings', 'options', 'Grid Options'),
    mod('column-customization', 'columns', 'Column Settings'),
    mod('conditional-styling', 'styling', 'Conditional Styling'),
    mod('editing', 'editing', 'Editing'),
  ];

  it('renders grouped menubar triggers', () => {
    render(
      <SettingsModuleMenubar
        modules={modules}
        activeId="general-settings"
        onActiveIdChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('v2-settings-module-menubar')).toBeInTheDocument();
    expect(screen.getByTestId('v2-settings-nav-group-options')).toBeInTheDocument();
    expect(screen.getByTestId('v2-settings-nav-group-columns')).toBeInTheDocument();
    expect(screen.getByTestId('v2-settings-active-module')).toHaveTextContent('Grid Options');
  });

  it('opens a group menu and selects a module', async () => {
    const user = userEvent.setup();
    const onActiveIdChange = vi.fn();
    render(
      <SettingsModuleMenubar
        modules={modules}
        activeId="general-settings"
        onActiveIdChange={onActiveIdChange}
      />,
    );

    await user.click(screen.getByTestId('v2-settings-nav-group-columns'));
    await waitFor(() => expect(screen.getByTestId('v2-settings-nav-menu-column-customization')).toBeInTheDocument());
    await user.click(screen.getByTestId('v2-settings-nav-menu-column-customization'));
    expect(onActiveIdChange).toHaveBeenCalledWith('column-customization');
  });

  it('returns null when no modules provided', () => {
    const { container } = render(
      <SettingsModuleMenubar modules={[]} activeId="" onActiveIdChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
