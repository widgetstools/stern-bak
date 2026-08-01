import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PillToggleBtn, PillToggleGroup } from './PillToggleGroup';

describe('PillToggleGroup', () => {
  it('groups toggle buttons with role=group', () => {
    render(
      <PillToggleGroup>
        <PillToggleBtn active aria-label="bold">B</PillToggleBtn>
        <PillToggleBtn aria-label="italic">I</PillToggleBtn>
      </PillToggleGroup>,
    );
    expect(screen.getByRole('group')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'bold' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('fires onClick from PillToggleBtn', () => {
    const onClick = vi.fn();
    render(
      <PillToggleGroup>
        <PillToggleBtn onClick={onClick} data-testid="btn">
          X
        </PillToggleBtn>
      </PillToggleGroup>,
    );
    fireEvent.click(screen.getByTestId('btn'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('respects disabled and custom styles on PillToggleBtn', () => {
    const onClick = vi.fn();
    render(
      <PillToggleGroup style={{ gap: 4 }}>
        <PillToggleBtn disabled onClick={onClick} data-testid="off">
          Off
        </PillToggleBtn>
        <PillToggleBtn active={false} style={{ width: 40 }} data-testid="plain">
          Plain
        </PillToggleBtn>
        <PillToggleBtn active aria-label="on" data-testid="on">
          On
        </PillToggleBtn>
      </PillToggleGroup>,
    );
    fireEvent.click(screen.getByTestId('off'));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByTestId('plain').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('on').getAttribute('aria-pressed')).toBe('true');
  });

  it('uses title as aria-label fallback and prevents mouseDown default', () => {
    render(
      <PillToggleGroup style={{ marginTop: 2 }}>
        <PillToggleBtn title="Underline" data-testid="u">
          U
        </PillToggleBtn>
      </PillToggleGroup>,
    );
    expect(screen.getByRole('button', { name: 'Underline' })).toBeTruthy();
    const btn = screen.getByTestId('u');
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    btn.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
