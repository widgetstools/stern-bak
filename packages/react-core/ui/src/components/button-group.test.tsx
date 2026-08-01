import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ButtonGroup } from './button-group.js';
import { Button } from './button.js';

afterEach(cleanup);

describe('ButtonGroup', () => {
  it('groups adjacent buttons under a single toolbar landmark', () => {
    render(
      <ButtonGroup>
        <Button>Left</Button>
        <Button>Right</Button>
      </ButtonGroup>,
    );

    expect(screen.getByRole('group')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Left' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Right' })).toBeInTheDocument();
  });

  it('merges a caller className on the group wrapper', () => {
    render(
      <ButtonGroup className="w-full">
        <Button>One</Button>
      </ButtonGroup>,
    );

    expect(screen.getByRole('group')).toHaveClass('w-full');
  });
});
