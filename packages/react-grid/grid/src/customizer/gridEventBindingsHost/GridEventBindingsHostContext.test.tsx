/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  boundHandlerForEvent,
  GridEventBindingsHostProvider,
  useGridEventBindingsHost,
} from './GridEventBindingsHostContext.js';

function Probe() {
  const host = useGridEventBindingsHost();
  return (
    <div>
      <span role="status">{host?.available ? 'available' : 'missing'}</span>
      <span role="note">{host ? Object.keys(host.bindings).length : 0}</span>
    </div>
  );
}

describe('GridEventBindingsHostContext', () => {
  it('provides host api to descendants', () => {
    const value = {
      available: true,
      bindings: { 'grid.rowClick': ['handler-1'] },
      catalog: [],
      handlerIds: ['handler-1'],
      setBindings: () => {},
      setEventHandler: () => {},
    };
    render(
      <GridEventBindingsHostProvider value={value}>
        <Probe />
      </GridEventBindingsHostProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('available');
    expect(screen.getByRole('note')).toHaveTextContent('1');
  });

  it('returns null outside provider', () => {
    render(<Probe />);
    expect(screen.getByRole('status')).toHaveTextContent('missing');
  });
});

describe('boundHandlerForEvent', () => {
  it('returns first bound handler id', () => {
    expect(boundHandlerForEvent({ click: ['h1', 'h2'] }, 'click')).toBe('h1');
    expect(boundHandlerForEvent({}, 'missing')).toBeNull();
  });
});
