import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import {
  EDITING_MODULE_ID,
  INITIAL_EDITING,
  type EditingState,
} from '@wellsfargo-starui/core';
import { GridProvider } from '../../customizer/internal.js';
import { EditingToolbarKeyboardMenu } from './EditingToolbarKeyboardMenu';

function mountMenu(overrides?: {
  nudges?: Array<{ id: string; name: string; incrementStep: number; decrementStep?: number; enabled: boolean }>;
  shortcuts?: Array<{ id: string; name: string; shortcutKey: string; operation: string; shortcutValue: string; enabled: boolean }>;
  plusEnabled?: boolean;
  shortcutsEnabled?: boolean;
}) {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [] });
  platform.store.setModuleState<EditingState>(EDITING_MODULE_ID, () => ({
    ...structuredClone(INITIAL_EDITING),
    plusMinus: {
      settings: { enabled: overrides?.plusEnabled ?? true, recordHistory: true },
      nudges: (overrides?.nudges ?? [
        { id: 'n1', name: 'Price', incrementStep: 0.01, decrementStep: 0.01, enabled: true },
      ]) as EditingState['plusMinus']['nudges'],
    },
    shortcuts: {
      settings: { enabled: overrides?.shortcutsEnabled ?? true, recordHistory: true },
      shortcuts: (overrides?.shortcuts ?? [
        { id: 's1', name: 'Fill down', shortcutKey: 'd', operation: 'set', shortcutValue: '100', enabled: true },
      ]) as unknown as EditingState['shortcuts']['shortcuts'],
    },
  }));
  return render(
    <GridProvider platform={platform}>
      <EditingToolbarKeyboardMenu />
    </GridProvider>,
  );
}

describe('EditingToolbarKeyboardMenu', () => {
  it('renders null when both modules disabled', () => {
    const { container } = mountMenu({ plusEnabled: false, shortcutsEnabled: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders keyboard menu trigger when nudges or shortcuts enabled', () => {
    mountMenu();
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  it('renders trigger for plus-minus-only configuration', () => {
    mountMenu({ shortcutsEnabled: false, shortcuts: [] });
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});
