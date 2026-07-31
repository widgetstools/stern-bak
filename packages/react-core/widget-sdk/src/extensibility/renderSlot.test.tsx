import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { renderSlot } from './renderSlot.js';

afterEach(cleanup);

describe('renderSlot', () => {
  it('returns null for an unset slot', () => {
    // Callers render the result directly, so `undefined` must become an
    // explicit null rather than leaking `undefined` into the tree.
    expect(renderSlot(undefined, {})).toBeNull();
    expect(renderSlot(null, {})).toBeNull();
  });

  it('renders a static node slot unchanged', () => {
    render(<>{renderSlot(<span>Position summary</span>, {})}</>);
    expect(screen.getByText('Position summary')).toBeDefined();
  });

  it('calls a dynamic slot with the context and renders its output', () => {
    const slot = vi.fn((ctx: { rows: number }) => <span>rows: {ctx.rows}</span>);
    render(<>{renderSlot(slot, { rows: 7 })}</>);

    expect(slot).toHaveBeenCalledWith({ rows: 7 });
    expect(screen.getByText('rows: 7')).toBeDefined();
  });

  it('treats falsy-but-present slot values as content, not as absent', () => {
    // 0 and '' are legitimate ReactNodes; only undefined/null mean "no slot".
    expect(renderSlot(0, {})).toBe(0);
    expect(renderSlot('', {})).toBe('');
  });
});
