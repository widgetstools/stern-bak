import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TabStrip } from './TabStrip';

const ITEMS = [
  { value: 'rule', label: 'Rule' },
  { value: 'preview', label: 'Preview', badge: 3 },
  { value: 'locked', label: 'Locked', disabled: true },
];

describe('TabStrip', () => {
  it('marks the active tab with aria-pressed', () => {
    render(<TabStrip items={ITEMS} value="rule" onChange={() => {}} data-testid="tabs" />);
    const active = screen.getByRole('button', { name: /Rule/i });
    expect(active.getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onChange for enabled tabs', () => {
    const onChange = vi.fn();
    render(<TabStrip items={ITEMS} value="rule" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Preview/i }));
    expect(onChange).toHaveBeenCalledWith('preview');
  });

  it('does not call onChange for disabled tabs', () => {
    const onChange = vi.fn();
    render(<TabStrip items={ITEMS} value="rule" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Locked/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders trailing slot', () => {
    render(
      <TabStrip
        items={ITEMS}
        value="rule"
        onChange={() => {}}
        trailing={<span data-testid="trail">hint</span>}
      />,
    );
    expect(screen.getByTestId('trail')).toBeTruthy();
  });
});
