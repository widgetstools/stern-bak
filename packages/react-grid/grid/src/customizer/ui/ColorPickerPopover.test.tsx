import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ColorPickerPopover } from './ColorPickerPopover';

describe('ColorPickerPopover', () => {
  it('ColorPickerPopover opens popover on trigger click', async () => {
    const onChange = vi.fn();
    render(
      <ColorPickerPopover
        value="#112233"
        onChange={onChange}
        icon={<span data-testid="icon">🎨</span>}
        title="Pick fill"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Pick fill'));
    });
    expect(screen.getAllByDisplayValue('#112233').length).toBeGreaterThan(0);
  });
});
