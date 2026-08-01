import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConfigManager } from '@wellsfargo-starui/host-config';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import { DataServicesProvider } from './DataServicesProvider.js';
import { HubInspectorHost } from './HubInspectorHost.js';

/**
 * HubInspectorHost exists only to bind Alt+Shift+S to the drawer's open
 * state. The chord is the whole contract, so it is driven through
 * userEvent against the real drawer rather than by poking at state.
 */

const getHubIntrospect = vi.fn();

const services: DataServices = {
  client: { getHubIntrospect, invalidateConfig: vi.fn() } as unknown as DataServices['client'],
  appData: {
    ready: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => () => undefined),
    list: vi.fn(() => []),
  } as unknown as DataServices['appData'],
  configManager: { getAppId: () => 'star-demo' } as unknown as ConfigManager,
  ready: Promise.resolve(),
  dispose: vi.fn(),
};

function stub(prop: 'offsetWidth' | 'offsetHeight', value: number) {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, value });
  return () => { if (original) Object.defineProperty(HTMLElement.prototype, prop, original); };
}

let restore: Array<() => void> = [];

beforeEach(() => {
  getHubIntrospect.mockReset().mockResolvedValue({
    connectedPorts: 1,
    catalogReady: true,
    catalogProviderCount: 0,
    runningProviderCount: 0,
    providers: [],
    appData: { listenerCount: 0, rows: [] },
  });
  restore = [stub('offsetWidth', 600), stub('offsetHeight', 400)];
});

afterEach(() => {
  restore.forEach((fn) => fn());
  cleanup();
});

function renderHost() {
  return render(
    <DataServicesProvider services={services} userId="k123">
      <HubInspectorHost />
    </DataServicesProvider>,
  );
}

describe('HubInspectorHost', () => {
  it('starts closed and does not poll the hub', () => {
    renderHost();

    expect(screen.queryByText('Data Services Hub')).toBeNull();
    expect(getHubIntrospect).not.toHaveBeenCalled();
  });

  it('Alt+Shift+S opens the inspector, and pressing it again closes it', async () => {
    renderHost();

    await userEvent.keyboard('{Alt>}{Shift>}s{/Shift}{/Alt}');
    expect(await screen.findByText('Data Services Hub')).toBeDefined();

    await userEvent.keyboard('{Alt>}{Shift>}s{/Shift}{/Alt}');
    await waitFor(() => expect(screen.queryByText('Data Services Hub')).toBeNull());
  });

  it('leaves the inspector closed for a plain "s" keystroke', async () => {
    // The host mounts in every dev build; an unmodified letter must never
    // pop the drawer over a widget the user is typing into.
    renderHost();

    await userEvent.keyboard('s');

    expect(screen.queryByText('Data Services Hub')).toBeNull();
  });
});
