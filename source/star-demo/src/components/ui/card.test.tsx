import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './card';

describe('Card components', () => {
  it('renders card structure with merged classes', () => {
    render(
      <Card className="extra-card" data-testid="card">
        <CardHeader className="extra-header">
          <CardTitle className="extra-title">Title</CardTitle>
          <CardDescription className="extra-desc">Description</CardDescription>
        </CardHeader>
        <CardContent className="extra-content">Body</CardContent>
      </Card>,
    );

    expect(screen.getByTestId('card')).toHaveClass('extra-card', 'rounded-md');
    expect(screen.getByText('Title')).toHaveClass('extra-title', 'font-semibold');
    expect(screen.getByText('Description')).toHaveClass('extra-desc', 'text-muted-foreground');
    expect(screen.getByText('Body')).toHaveClass('extra-content');
  });
});
