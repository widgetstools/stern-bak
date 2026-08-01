import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider } from './ThemeProvider.js';

afterEach(cleanup);

describe('ThemeProvider', () => {
  it('renders children inside the next-themes provider', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <span>MarketsUI</span>
      </ThemeProvider>,
    );

    expect(screen.getByText('MarketsUI')).toBeInTheDocument();
  });

  it('accepts a custom storage key without breaking render', () => {
    render(
      <ThemeProvider defaultTheme="dark" storageKey="demo-theme">
        <button type="button">Toggle theme</button>
      </ThemeProvider>,
    );

    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
  });
});
