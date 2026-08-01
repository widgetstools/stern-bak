/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { render, screen } from '@testing-library/react';
import { NativeOptionsSelect } from './NativeOptionsSelect.js';

describe('NativeOptionsSelect', () => {
  it('renders placeholder button when there are no options', () => {
    render(<NativeOptionsSelect data-testid="empty-select" />);
    expect(screen.getByTestId('empty-select')).toHaveTextContent('—');
  });

  it('selects an option and maps empty string through sentinel', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NativeOptionsSelect data-testid="opts" onChange={onChange} defaultValue="">
        <option value="">Any</option>
        <option value="buy">Buy</option>
      </NativeOptionsSelect>,
    );

    await user.click(screen.getByTestId('opts'));
    await user.click(screen.getByRole('option', { name: 'Buy' }));
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'buy' } });
  });

  it('supports controlled numeric values and fragments', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NativeOptionsSelect data-testid="nums" value={1} onChange={onChange}>
        <>
          <option value={1}>One</option>
          <option value={2}>Two</option>
        </>
      </NativeOptionsSelect>,
    );

    await user.click(screen.getByTestId('nums'));
    await user.click(screen.getByRole('option', { name: 'Two' }));
    expect(onChange).toHaveBeenCalledWith({ target: { value: '2' } });
  });
});

describe('NativeOptionsSelect collectOptions edge cases', () => {
  it('ignores invalid child nodes', () => {
    render(
      <NativeOptionsSelect data-testid="mixed">
        {null}
        {'text'}
        <option value="x">X</option>
      </NativeOptionsSelect>,
    );
    expect(screen.getByTestId('mixed')).toBeTruthy();
  });
});
