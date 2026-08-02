import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ConfigBrowser from './ConfigBrowser';

describe('ConfigBrowser', () => {
  it('renders ConfigBrowserPanel', () => {
    render(<ConfigBrowser />);
    expect(screen.getByTestId('config-browser-panel')).toBeInTheDocument();
  });
});
