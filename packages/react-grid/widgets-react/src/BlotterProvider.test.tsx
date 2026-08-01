import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BlotterProvider, useBlotterDI } from './BlotterProvider.js';

function Consumer() {
  const di = useBlotterDI();
  return (
    <span data-testid="di">
      {di.dataProvider ? 'has-provider' : 'no-provider'}
      {di.actionRegistry ? '-has-actions' : ''}
    </span>
  );
}

describe('BlotterProvider', () => {
  it('passes dependencies to context consumers', () => {
    const dataProvider = { id: 'dp' } as never;
    const actionRegistry = { get: () => [] } as never;
    render(
      <BlotterProvider dataProvider={dataProvider} actionRegistry={actionRegistry}>
        <Consumer />
      </BlotterProvider>,
    );
    expect(screen.getByTestId('di')).toHaveTextContent('has-provider-has-actions');
  });

  it('defaults to empty deps outside the provider', () => {
    render(<Consumer />);
    expect(screen.getByTestId('di')).toHaveTextContent('no-provider');
  });
});
