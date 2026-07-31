import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card.js';
import { Button } from './button.js';

afterEach(cleanup);

describe('Card', () => {
  it('composes header, content, and footer regions', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
          <CardDescription>Live book</CardDescription>
        </CardHeader>
        <CardContent>42 rows</CardContent>
        <CardFooter>
          <Button>Refresh</Button>
        </CardFooter>
      </Card>,
    );

    expect(screen.getByText('Positions')).toBeInTheDocument();
    expect(screen.getByText('Live book')).toBeInTheDocument();
    expect(screen.getByText('42 rows')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('merges className on the card shell', () => {
    const { container } = render(
      <Card className="max-w-md">
        <CardContent>Body</CardContent>
      </Card>,
    );

    expect(container.firstElementChild).toHaveClass('max-w-md');
  });
});
