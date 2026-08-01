import '../testSetupMocks';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigBrowserPanel } from './ConfigBrowserPanel';

describe('ConfigBrowserPanel', () => {
  it('renders the StarUI config browser inside a containing block wrapper', () => {
    const { container } = render(<ConfigBrowserPanel />);

    expect(screen.getByTestId('star-config-browser')).toBeInTheDocument();
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.transform).toBe('translateZ(0)');
    expect(wrapper.className).toContain('relative');
  });
});
