import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle } from './alert.js';

afterEach(cleanup);

describe('Alert', () => {
  it('renders as an alert landmark with title and description', () => {
    render(
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Something needs attention.</AlertDescription>
      </Alert>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('Something needs attention.')).toBeInTheDocument();
  });

  it('applies the destructive variant classes', () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
      </Alert>,
    );

    expect(screen.getByRole('alert').className).toContain('text-destructive');
  });

  it('merges a caller className', () => {
    render(
      <Alert className="mt-2">
        <AlertTitle>Note</AlertTitle>
      </Alert>,
    );

    expect(screen.getByRole('alert')).toHaveClass('mt-2');
  });
});
