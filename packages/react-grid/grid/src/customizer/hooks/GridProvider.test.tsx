/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider, useGridPlatform, useOptionalGridPlatform } from './GridProvider.js';

describe('GridProvider', () => {
  it('provides platform to descendants via useGridPlatform', () => {
    const platform = new GridPlatform({ gridId: 'provider-test', modules: [] });
    function Consumer() {
      const p = useGridPlatform();
      return <span data-testid="grid-id">{p.gridId}</span>;
    }
    render(
      <GridProvider platform={platform}>
        <Consumer />
      </GridProvider>,
    );
    expect(screen.getByTestId('grid-id')).toHaveTextContent('provider-test');
  });

  it('throws when useGridPlatform runs outside a provider', () => {
    function Orphan() {
      useGridPlatform();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(
      'useGridPlatform() must be used inside <GridProvider>',
    );
  });

  it('returns null from useOptionalGridPlatform when no provider', () => {
    function OptionalConsumer() {
      const p = useOptionalGridPlatform();
      return <span data-testid="optional">{p === null ? 'none' : p.gridId}</span>;
    }
    render(<OptionalConsumer />);
    expect(screen.getByTestId('optional')).toHaveTextContent('none');
  });
});
