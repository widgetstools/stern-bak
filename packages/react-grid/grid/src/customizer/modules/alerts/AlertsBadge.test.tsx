/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import type { AlertsState } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import { AlertsBadge } from './AlertsBadge';
import { alertsModule } from './index';

function makePlatform(withHistory = true) {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [alertsModule] });
  if (withHistory) {
    platform.store.setModuleState<AlertsState>('alerts', (s) => ({
      ...s,
      history: [{
        id: 'n1',
        ruleName: 'Price spike',
        message: 'ABC crossed 100',
        severity: 'warning',
        firedAt: Date.now(),
        read: false,
        rowId: 'r1',
        column: 'price',
      }],
    }));
  }
  return platform;
}

describe('AlertsBadge', () => {
  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    if (!HTMLElement.prototype.hasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = () => false;
      HTMLElement.prototype.setPointerCapture = () => {};
      HTMLElement.prototype.releasePointerCapture = () => {};
    }
  });

  afterEach(cleanup);

  it('renders nothing outside GridProvider', () => {
    const { container } = render(<AlertsBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('shows unread count on trigger', () => {
    render(
      <GridProvider platform={makePlatform()}>
        <AlertsBadge />
      </GridProvider>,
    );
    expect(screen.getByTestId('alerts-badge-trigger')).toBeTruthy();
    expect(screen.getByTestId('alerts-badge-count').textContent).toBe('1');
  });

  it('mark all read clears unread badge', () => {
    render(
      <GridProvider platform={makePlatform()}>
        <AlertsBadge />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('alerts-badge-trigger')));
    act(() => fireEvent.click(screen.getByTestId('alerts-badge-mark-read')));
    expect(screen.queryByTestId('alerts-badge-count')).toBeNull();
  });

  it('clear history removes notifications from popover', () => {
    render(
      <GridProvider platform={makePlatform()}>
        <AlertsBadge />
      </GridProvider>,
    );
    act(() => fireEvent.click(screen.getByTestId('alerts-badge-trigger')));
    expect(screen.getByTestId('alerts-notification-n1')).toBeTruthy();
    act(() => fireEvent.click(screen.getByTestId('alerts-badge-clear')));
    expect(screen.getByText(/No alerts yet/i)).toBeTruthy();
  });
});
