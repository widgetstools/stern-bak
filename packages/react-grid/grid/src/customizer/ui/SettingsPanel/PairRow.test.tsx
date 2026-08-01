import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PairRow } from './PairRow';

describe('PairRow', () => {
  it('renders left and right slots equally', () => {
    render(
      <PairRow
        left={<span data-testid="left">L</span>}
        right={<span data-testid="right">R</span>}
      />,
    );
    expect(screen.getByTestId('left')).toBeTruthy();
    expect(screen.getByTestId('right')).toBeTruthy();
  });

  it('renders optional trailing slot', () => {
    render(
      <PairRow
        left={<span>L</span>}
        right={<span>R</span>}
        trailing={<button type="button">lock</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'lock' })).toBeTruthy();
  });
});
