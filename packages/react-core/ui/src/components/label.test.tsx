import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Input } from './input.js';
import { Label } from './label.js';

afterEach(cleanup);

describe('Label', () => {
  it('associates with a control by htmlFor', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" />
      </>,
    );

    expect(screen.getByText('Email')).toHaveAttribute('for', 'email');
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
  });

  it('merges a caller className', () => {
    render(<Label className="text-primary">Field</Label>);

    expect(screen.getByText('Field')).toHaveClass('text-primary');
  });
});
