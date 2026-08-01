import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GhostIcon } from './GhostIcon';

describe('GhostIcon', () => {
  it('renders children and fires onClick when enabled', () => {
    const onClick = vi.fn();
    render(
      <GhostIcon aria-label="delete" onClick={onClick} data-testid="gi">
        <span>×</span>
      </GhostIcon>,
    );
    fireEvent.click(screen.getByTestId('gi'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('uses title as aria-label fallback', () => {
    render(
      <GhostIcon title="Remove">
        <span>×</span>
      </GhostIcon>,
    );
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('blocks clicks when disabled', () => {
    const onClick = vi.fn();
    render(
      <GhostIcon aria-label="x" disabled onClick={onClick} data-testid="gi">
        ×
      </GhostIcon>,
    );
    fireEvent.click(screen.getByTestId('gi'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards custom style overrides', () => {
    render(
      <GhostIcon aria-label="styled" style={{ color: 'red' }} data-testid="gi">
        ×
      </GhostIcon>,
    );
    expect(screen.getByTestId('gi').style.color).toBe('red');
  });

  it('prefers explicit aria-label over title', () => {
    render(
      <GhostIcon title="Remove" aria-label="delete" data-testid="gi">
        ×
      </GhostIcon>,
    );
    expect(screen.getByRole('button', { name: 'delete' })).toBeTruthy();
  });

  it('prevents default on mouseDown to preserve focus', () => {
    render(
      <GhostIcon aria-label="x" data-testid="gi">
        ×
      </GhostIcon>,
    );
    const btn = screen.getByTestId('gi');
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    btn.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
