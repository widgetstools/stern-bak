import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DirtyDot, LedBar } from './DirtyDot';

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

describe('DirtyDot', () => {
  it('renders invisible spacer when hidden', () => {
    const { container } = render(<DirtyDot hidden />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('renders amber led when visible', () => {
    render(<DirtyDot />);
    expect(screen.getByLabelText('Unsaved changes')).toBeTruthy();
  });
});
