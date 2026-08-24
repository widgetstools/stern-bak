import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ToolCallCard, type ToolActivity } from './ToolCallCard';

const activity = (over: Partial<ToolActivity> = {}): ToolActivity => ({
  id: 'call_1',
  name: 'get_grid_columns',
  args: { targetGridId: 'grid-test' },
  status: 'ok',
  summary: 'ticker (Ticker, text), issuerName (Issuer Name, text), side (Side, text)',
  ...over,
});

describe('ToolCallCard', () => {
  it('shows the tool name and its summary collapsed', () => {
    render(<ToolCallCard activity={activity()} />);
    expect(screen.getByText('get_grid_columns')).toBeTruthy();
    expect(screen.getByText(/ticker \(Ticker, text\)/)).toBeTruthy();
    expect(screen.queryByText('Arguments')).toBeNull();
  });

  it('reveals arguments and result when expanded', async () => {
    render(<ToolCallCard activity={activity({ result: { rows: 3 } })} />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Arguments')).toBeTruthy();
    expect(screen.getByText('Result')).toBeTruthy();
  });

  /**
   * Regression guard. Without `min-w-0` the summary's `truncate` is inert — a
   * flex item's default `min-width: auto` holds it at full content width, which
   * widens the transcript column and aligns every `self-end` user bubble to the
   * right edge of the overflow, off-screen. jsdom does no layout, so the class
   * contract is what's assertable here.
   */
  it('keeps the summary shrinkable so a long one truncates instead of widening the transcript', () => {
    render(<ToolCallCard activity={activity()} />);
    const summary = screen.getByText(/ticker \(Ticker, text\)/);
    expect(summary.className).toContain('min-w-0');
    expect(summary.className).toContain('truncate');
  });

  it('is not expandable when there is nothing to show', () => {
    render(<ToolCallCard activity={activity({ args: {}, result: undefined })} />);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });
});
