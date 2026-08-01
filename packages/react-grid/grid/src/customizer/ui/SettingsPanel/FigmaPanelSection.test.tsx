import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FigmaPanelSection } from './FigmaPanelSection';

describe('FigmaPanelSection', () => {
  it('expands and collapses in uncontrolled mode', () => {
    render(
      <FigmaPanelSection title="HEADER" index="01" data-testid="sec">
        <div data-testid="body">content</div>
      </FigmaPanelSection>,
    );
    expect(screen.getByTestId('body')).toBeTruthy();

    fireEvent.click(screen.getByText('HEADER'));
    expect(screen.queryByTestId('body')).toBeNull();
  });

  it('delegates toggle to onToggle in controlled mode', () => {
    const onToggle = vi.fn();
    render(
      <FigmaPanelSection title="LAYOUT" collapsed onToggle={onToggle} index="02">
        body
      </FigmaPanelSection>,
    );
    fireEvent.click(screen.getByText('LAYOUT'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders header actions without toggling section', () => {
    const onToggle = vi.fn();
    render(
      <FigmaPanelSection
        title="STYLE"
        collapsed
        onToggle={onToggle}
        actions={<button type="button" data-testid="act">+</button>}
      >
        body
      </FigmaPanelSection>,
    );
    fireEvent.click(screen.getByTestId('act'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
