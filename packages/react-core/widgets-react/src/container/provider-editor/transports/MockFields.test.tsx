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

  it('falls back to default values when optional cfg fields are omitted', () => {
    render(
      <MockFields
        cfg={{ providerType: 'mock', updateInterval: 3000 } as typeof base}
        onChange={vi.fn()}
      />,
    );
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs[0]).toHaveValue(50);
    expect(inputs[1]).toHaveValue(3000);
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
  });

  it('coerces invalid numeric input to zero', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MockFields cfg={base} onChange={onChange} />);
    const inputs = screen.getAllByRole('spinbutton');
    await user.clear(inputs[0]!);
    await user.type(inputs[0]!, 'abc');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rowCount: 0 }));
  });
});
