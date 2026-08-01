import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyValueEditor } from './KeyValueEditor.js';

describe('KeyValueEditor', () => {
  it('shows empty state and adds a blank pair', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <KeyValueEditor label="Headers" value={{}} onChange={onChange} />,
    );
    expect(screen.getByText('No entries configured')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenCalledWith({ '': '' });
  });

  it('renames keys and updates values', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        label="Query"
        value={{ foo: 'bar' }}
        onChange={onChange}
      />,
    );
    const inputs = screen.getAllByRole('textbox');
    await user.clear(inputs[0]!);
    await user.type(inputs[0]!, 'q');
    expect(onChange).toHaveBeenCalled();
    await user.clear(inputs[1]!);
    await user.type(inputs[1]!, 'v');
    expect(onChange).toHaveBeenCalled();
  });

  it('removes an entry', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <KeyValueEditor label="Query" value={{ a: '1' }} onChange={onChange} />,
    );
    const removeBtn = screen.getAllByRole('button').find((b) => b.className.includes('hover:text-destructive'));
    expect(removeBtn).toBeTruthy();
    await user.click(removeBtn!);
    expect(onChange).toHaveBeenCalledWith({});
  });
});
