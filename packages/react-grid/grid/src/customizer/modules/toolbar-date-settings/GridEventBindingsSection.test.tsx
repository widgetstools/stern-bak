/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  GridEventBindingsHostProvider,
  type GridEventBindingsHostApi,
} from '../../gridEventBindingsHost/GridEventBindingsHostContext';
import { GridEventBindingsSection } from './GridEventBindingsSection';

function makeHost(over: Partial<GridEventBindingsHostApi> = {}): GridEventBindingsHostApi {
  return {
    available: true,
    bindings: {},
    catalog: [],
    handlerIds: ['logEvent', 'noopHandler'],
    handlerMeta: {
      logEvent: { label: 'Log to console' },
      noopHandler: { label: 'No-op' },
    },
    setBindings: vi.fn(),
    setEventHandler: vi.fn(),
    ...over,
  };
}

describe('GridEventBindingsSection', () => {
  it('shows unavailable message when host is not wired', () => {
    render(
      <GridEventBindingsHostProvider value={{ ...makeHost(), available: false }}>
        <GridEventBindingsSection draft={{}} onBindingChange={vi.fn()} />
      </GridEventBindingsHostProvider>,
    );
    expect(screen.getByText(/MarketsGridContainer/i)).toBeTruthy();
  });

  it('shows empty-registry message when no handlers are registered', () => {
    render(
      <GridEventBindingsHostProvider value={makeHost({ handlerIds: [] })}>
        <GridEventBindingsSection draft={{}} onBindingChange={vi.fn()} />
      </GridEventBindingsHostProvider>,
    );
    expect(screen.getByText(/No handlers registered/i)).toBeTruthy();
  });

  it('renders catalog rows and stages binding changes', async () => {
    const user = userEvent.setup();
    const onBindingChange = vi.fn();
    render(
      <GridEventBindingsHostProvider value={makeHost()}>
        <GridEventBindingsSection draft={{}} onBindingChange={onBindingChange} />
      </GridEventBindingsHostProvider>,
    );

    expect(screen.getByTestId('grid-event-binding-grid:ready')).toBeTruthy();
    await user.click(screen.getByTestId('grid-event-handler-select-grid:ready'));
    await user.click(await screen.findByRole('option', { name: 'Log to console' }));
    expect(onBindingChange).toHaveBeenCalledWith('grid:ready', 'logEvent');
  });
});
