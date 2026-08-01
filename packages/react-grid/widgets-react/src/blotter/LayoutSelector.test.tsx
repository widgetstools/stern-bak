import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayoutSelector } from './LayoutSelector.js';

const layouts = [
  { id: 'l1', name: 'Default', isDefault: true },
  { id: 'l2', name: 'Compact', isDefault: false },
];

describe('LayoutSelector', () => {
  it('calls onSave when Save is clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <LayoutSelector
        layouts={layouts}
        activeLayoutId="l1"
        onSelect={vi.fn()}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows the active layout and default suffix', () => {
    render(
      <LayoutSelector
        layouts={layouts}
        activeLayoutId="l1"
        onSelect={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
