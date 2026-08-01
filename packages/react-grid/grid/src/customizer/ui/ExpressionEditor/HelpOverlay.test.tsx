import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HelpOverlay } from './HelpOverlay';

describe('HelpOverlay', () => {
  it('renders cheat sheet dialog', () => {
    render(<HelpOverlay onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Expression editor help' })).toBeTruthy();
    expect(screen.getByText(/Expression Editor — Cheat Sheet/i)).toBeTruthy();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<HelpOverlay onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on outside mousedown', () => {
    const onClose = vi.fn();
    render(<HelpOverlay onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
