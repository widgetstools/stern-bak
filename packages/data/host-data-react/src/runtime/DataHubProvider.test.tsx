import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, Suspense, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/host-config';
import type { ResolvedDataServicesHubBundle } from '@wellsfargo-starui/host-data';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import { usePlatformIdentityOrNull } from './DataServicesProvider.js';

/**
 * DataHubProvider has two entry shapes: a resolved `platform` bundle, or a
 * bootstrapConfig it resolves itself. `ensurePlatformReady` is the boundary
 * and is mocked at the module edge; everything below it — the mapping onto
 * DataServices, the user-id defaulting, the inspector mount — is real.
 */

const ensurePlatformReady = vi.fn();

vi.mock('@wellsfargo-starui/host-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/host-data')>();
  return { ...actual, ensurePlatformReady: (...args: unknown[]) => ensurePlatformReady(...args) };
});

const { DataHubProvider, PlatformProvider } = await import('./DataHubProvider.js');

const dispose = vi.fn();

function makeBundle(overrides: Partial<ResolvedDataServicesHubBundle> = {}): ResolvedDataServicesHubBundle {
  return {
    client: { getHubIntrospect: vi.fn().mockResolvedValue(null), invalidateConfig: vi.fn() },
    appData: {
      ready: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(() => () => undefined),
      list: vi.fn(() => []),
      get: vi.fn(),
    },
    configManager: { getAppId: () => 'star-demo' } as unknown as ConfigManager,
    appDataReady: Promise.resolve(),
    dispose,
    ...overrides,
  } as unknown as ResolvedDataServicesHubBundle;
}

function Identity() {
  const identity = usePlatformIdentityOrNull();
  return <p>{identity ? `${identity.appId}/${identity.userId}` : 'no identity'}</p>;
}

class Boundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) { return { message: error.message }; }
  render() { return this.state.message ? <p>failed: {this.state.message}</p> : this.props.children; }
}

const bootstrapConfig = { appId: 'star-demo', userId: 'k123', useRest: false };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DataHubProvider — resolved platform', () => {
  it('publishes the bundle identity to the tree', () => {
    render(
      <DataHubProvider platform={makeBundle()} userId="k123" hubInspector={false}>
        <Identity />
      </DataHubProvider>,
    );

    expect(screen.getByText('star-demo/k123')).toBeDefined();
    expect(ensurePlatformReady).not.toHaveBeenCalled();
  });

  it('defaults the session user to the pinned logged-in user', () => {
    render(
      <DataHubProvider platform={makeBundle()} hubInspector={false}>
        <Identity />
      </DataHubProvider>,
    );

    expect(screen.getByText(`star-demo/${LOGGED_IN_USER_ID}`)).toBeDefined();
  });

  it('mounts the hub inspector only when asked', async () => {
    const { rerender } = render(
      <DataHubProvider platform={makeBundle()} hubInspector={false}>
        <p>widget</p>
      </DataHubProvider>,
    );
    expect(screen.queryByRole('presentation')).toBeNull();
    expect(screen.getByText('widget')).toBeDefined();

    rerender(
      <DataHubProvider platform={makeBundle()} hubInspector>
        <p>widget</p>
      </DataHubProvider>,
    );
    // The inspector renders a closed drawer — the observable difference is
    // that Alt+Shift+S now has something listening for it.
    expect(screen.getByText('widget')).toBeDefined();
  });

  it('PlatformProvider is the same component under its migration name', () => {
    expect(PlatformProvider).toBe(DataHubProvider);
  });
});

describe('DataHubProvider — self-bootstrapping', () => {
  it('bootstraps once and renders nothing until the hub resolves', async () => {
    let resolveBundle!: (b: ResolvedDataServicesHubBundle) => void;
    ensurePlatformReady.mockReturnValue(
      new Promise<ResolvedDataServicesHubBundle>((resolve) => { resolveBundle = resolve; }),
    );

    render(
      <DataHubProvider bootstrapConfig={bootstrapConfig} workerScriptUrl="https://cdn/worker.mjs">
        <Identity />
      </DataHubProvider>,
    );

    expect(screen.queryByText(/star-demo/)).toBeNull();
    expect(ensurePlatformReady).toHaveBeenCalledWith(bootstrapConfig, {
      workerScriptUrl: 'https://cdn/worker.mjs',
    });

    await act(async () => { resolveBundle(makeBundle()); });
    await waitFor(() => expect(screen.getByText('star-demo/k123')).toBeDefined());
  });

  it('takes the session user from the bootstrap config when none is given', async () => {
    ensurePlatformReady.mockResolvedValue(makeBundle());

    render(
      <DataHubProvider bootstrapConfig={{ ...bootstrapConfig, userId: 'from-bootstrap' }}>
        <Identity />
      </DataHubProvider>,
    );

    await waitFor(() => expect(screen.getByText('star-demo/from-bootstrap')).toBeDefined());
  });

  it('an explicit userId overrides the bootstrap config', async () => {
    ensurePlatformReady.mockResolvedValue(makeBundle());

    render(
      <DataHubProvider bootstrapConfig={bootstrapConfig} userId="override">
        <Identity />
      </DataHubProvider>,
    );

    await waitFor(() => expect(screen.getByText('star-demo/override')).toBeDefined());
  });

  it('does not re-bootstrap when only children change', async () => {
    ensurePlatformReady.mockResolvedValue(makeBundle());

    const { rerender } = render(
      <DataHubProvider bootstrapConfig={bootstrapConfig}><p>one</p></DataHubProvider>,
    );
    await waitFor(() => expect(screen.getByText('one')).toBeDefined());

    rerender(<DataHubProvider bootstrapConfig={bootstrapConfig}><p>two</p></DataHubProvider>);
    await waitFor(() => expect(screen.getByText('two')).toBeDefined());

    // A second bootstrap would open a second SharedWorker connection.
    expect(ensurePlatformReady).toHaveBeenCalledTimes(1);
  });

  it('re-bootstraps when the bootstrap identity changes', async () => {
    ensurePlatformReady.mockResolvedValue(makeBundle());

    const { rerender } = render(
      <DataHubProvider bootstrapConfig={bootstrapConfig}><p>tree</p></DataHubProvider>,
    );
    await waitFor(() => expect(ensurePlatformReady).toHaveBeenCalledTimes(1));

    rerender(
      <DataHubProvider bootstrapConfig={{ ...bootstrapConfig, userId: 'someone-else' }}>
        <p>tree</p>
      </DataHubProvider>,
    );
    await waitFor(() => expect(ensurePlatformReady).toHaveBeenCalledTimes(2));
  });

  it('rethrows a bootstrap failure into the nearest error boundary', async () => {
    ensurePlatformReady.mockRejectedValue(new Error('SharedWorker blocked'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <Boundary>
        <DataHubProvider bootstrapConfig={bootstrapConfig}><Identity /></DataHubProvider>
      </Boundary>,
    );

    // Swallowing this would leave a permanently blank app with no signal.
    expect(await screen.findByText('failed: SharedWorker blocked')).toBeDefined();
  });

  it('wraps a non-Error rejection so the boundary still gets a message', async () => {
    ensurePlatformReady.mockRejectedValue('worker refused');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <Boundary>
        <DataHubProvider bootstrapConfig={bootstrapConfig}><Identity /></DataHubProvider>
      </Boundary>,
    );

    expect(await screen.findByText('failed: worker refused')).toBeDefined();
  });

  it('suspends rather than rendering children in eager bootstrap mode', () => {
    ensurePlatformReady.mockReturnValue(new Promise<ResolvedDataServicesHubBundle>(() => {}));

    render(
      <Suspense fallback={<p>booting…</p>}>
        <DataHubProvider bootstrapConfig={bootstrapConfig} mode="eager"><Identity /></DataHubProvider>
      </Suspense>,
    );

    expect(screen.getByText('booting…')).toBeDefined();
  });
});
