/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CellChangeFlashColorSwatches } from './CellChangeFlashColorSwatches';

describe('CellChangeFlashColorSwatches', () => {
  it('renders swatches and fires onChange', () => {
    const onChange = vi.fn();
    render(<CellChangeFlashColorSwatches value="amber" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Flash colour amber' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('go-cell-change-flash-color-emerald'));
    expect(onChange).toHaveBeenCalledWith('emerald');
  });

  it('updates focus ring styles on focus and blur', () => {
    render(<CellChangeFlashColorSwatches value="amber" onChange={vi.fn()} />);
    const rose = screen.getByTestId('go-cell-change-flash-color-rose') as HTMLButtonElement;
    fireEvent.focus(rose);
    expect(rose.style.boxShadow).toContain('var(--ds-accent-positive)');
    fireEvent.blur(rose);
    expect(rose.style.boxShadow).toContain('var(--ds-border-primary)');
  });

  it('renders all palette swatches', () => {
    render(<CellChangeFlashColorSwatches value="slate" onChange={vi.fn()} />);
    for (const color of ['amber', 'emerald', 'rose', 'sky', 'violet', 'teal', 'orange', 'slate']) {
      expect(screen.getByTestId(`go-cell-change-flash-color-${color}`)).toBeTruthy();
    }
  });
});
