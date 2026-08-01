import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MultiSelect } from './MultiSelect.js';

const options = [
  { value: 'positionId', label: 'positionId' },
  { value: 'symbol', label: 'symbol', hint: 'text' },
];

afterEach(() => {
  cleanup();
});

describe('MultiSelect', () => {
  it('shows placeholder when empty and toggles a selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={[]} onChange={onChange} placeholder="Pick keys" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Pick keys');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('positionId'));
    expect(onChange).toHaveBeenCalledWith(['positionId']);
  });

  it('removes a selected pill without opening the popover', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelect options={options} value={['positionId', 'symbol']} onChange={onChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove positionId' }));
    expect(onChange).toHaveBeenCalledWith(['symbol']);
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(<MultiSelect options={options} value={[]} onChange={vi.fn()} disabled />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByPlaceholderText('Search columns…')).not.toBeInTheDocument();
  });
});
