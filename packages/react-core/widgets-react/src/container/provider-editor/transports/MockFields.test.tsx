import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockFields } from './MockFields.js';

const base = {
  providerType: 'mock' as const,
  rowCount: 50,
  updateIntervalMs: 2000,
  enableUpdates: true,
};

describe('MockFields', () => {
  it('updates row count and interval', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MockFields cfg={base} onChange={onChange} />);
    const inputs = screen.getAllByRole('spinbutton');
    await user.clear(inputs[0]!);
    await user.type(inputs[0]!, '100');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rowCount: expect.any(Number) }));
  });

  it('toggles enableUpdates via the switch', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MockFields cfg={base} onChange={onChange} />);
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith({ enableUpdates: false });
  });
});
