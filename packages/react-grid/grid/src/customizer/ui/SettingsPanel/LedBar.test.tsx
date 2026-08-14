import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LedBar } from './LedBar';

describe('LedBar', () => {
  it('defaults to on + green', () => {
    render(<LedBar title="ok" />);
    const el = screen.getByLabelText('ok');
    expect(el.getAttribute('data-on')).toBe('true');
    expect(el.getAttribute('data-amber')).toBe('false');
  });

  it('supports amber warning state', () => {
    render(<LedBar amber title="warn" />);
    expect(screen.getByLabelText('warn').getAttribute('data-amber')).toBe('true');
  });
});
