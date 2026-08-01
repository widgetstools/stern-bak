import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DEFAULT_TOOLBAR_COLORS, ToolbarContainer } from './ToolbarContainer.js';

afterEach(cleanup);

describe('ToolbarContainer', () => {
  it('renders child toolbars inside the container shell', () => {
    render(
      <ToolbarContainer>
        <div>First toolbar</div>
        <div>Second toolbar</div>
      </ToolbarContainer>,
    );

    expect(screen.getByText('First toolbar')).toBeInTheDocument();
    expect(screen.getByText('Second toolbar')).toBeInTheDocument();
  });

  it('merges a caller className on the outer wrapper', () => {
    const { container } = render(
      <ToolbarContainer className="absolute top-0">
        <span>Child</span>
      </ToolbarContainer>,
    );

    expect(container.querySelector('.toolbar-container')).toHaveClass('absolute', 'top-0');
  });

  it('exports a default color palette for toolbar instances', () => {
    expect(DEFAULT_TOOLBAR_COLORS.length).toBeGreaterThan(0);
    expect(DEFAULT_TOOLBAR_COLORS).toContain('blue-500');
  });
});
