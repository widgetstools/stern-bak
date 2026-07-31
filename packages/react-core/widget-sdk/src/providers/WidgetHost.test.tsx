import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { PlatformAdapter } from '@wellsfargo-starui/widget';

/**
 * WidgetHost owns three things worth testing: what it puts in context,
 * how it decides the config manager's REST URL, and the init/dispose
 * lifecycle. ConfigManager is a Dexie-backed boundary, so it is mocked at
 * the module edge; everything else is the real component.
 */

const init = vi.fn();
const dispose = vi.fn();
const createConfigManager = vi.fn();

vi.mock('@wellsfargo-starui/host-config', () => ({
  createConfigManager: (...args: unknown[]) => createConfigManager(...args),
}));

const { WidgetHost, useWidgetHost } = await import('./WidgetHost.js');
const { WidgetRegistry } = await import('../registry/WidgetRegistry.js');

function HostReadout() {
  const { apiUrl, userId, platform, registry } = useWidgetHost();
  return (
    <dl>
      <dt>apiUrl</dt><dd>{apiUrl || '(empty)'}</dd>
      <dt>userId</dt><dd>{userId}</dd>
      <dt>platform</dt><dd>{platform.name}</dd>
      <dt>types</dt><dd>{registry.getTypes().join(',') || '(none)'}</dd>
    </dl>
  );
}

const fakePlatform = { name: 'fake', isOpenFin: true } as unknown as PlatformAdapter;

beforeEach(() => {
  init.mockReset().mockResolvedValue(undefined);
  dispose.mockReset();
  createConfigManager.mockReset().mockImplementation(() => ({ init, dispose }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WidgetHost', () => {
  it('supplies apiUrl, userId, platform and registry to consumers', async () => {
    const registry = new WidgetRegistry({ blotter: () => null });
    render(
      <WidgetHost apiUrl="https://cfg.example" userId="k123" platform={fakePlatform} registry={registry}>
        <HostReadout />
      </WidgetHost>,
    );

    expect(screen.getByText('https://cfg.example')).toBeDefined();
    expect(screen.getByText('k123')).toBeDefined();
    expect(screen.getByText('fake')).toBeDefined();
    expect(screen.getByText('blotter')).toBeDefined();
  });

  it('falls back to a BrowserAdapter and an empty registry', () => {
    render(
      <WidgetHost apiUrl="" userId="k123">
        <HostReadout />
      </WidgetHost>,
    );

    expect(screen.getByText('browser')).toBeDefined();
    expect(screen.getByText('(none)')).toBeDefined();
  });

  it('forwards a non-empty apiUrl to the config manager as its REST base', () => {
    render(
      <WidgetHost apiUrl="https://cfg.example" userId="k123" platform={fakePlatform}>
        <HostReadout />
      </WidgetHost>,
    );

    expect(createConfigManager).toHaveBeenCalledWith({ configServiceRestUrl: 'https://cfg.example' });
  });

  it.each(['', '   '])('runs local-only when apiUrl is %o', (apiUrl) => {
    // A whitespace-only apiUrl must not become a REST base — the manager
    // would then try to sync against an unresolvable URL on every write.
    render(
      <WidgetHost apiUrl={apiUrl} userId="k123" platform={fakePlatform}>
        <HostReadout />
      </WidgetHost>,
    );

    expect(createConfigManager).toHaveBeenCalledWith({ configServiceRestUrl: undefined });
  });

  it('initialises the config manager on mount and disposes it on unmount', async () => {
    const { unmount } = render(
      <WidgetHost apiUrl="" userId="k123" platform={fakePlatform}>
        <HostReadout />
      </WidgetHost>,
    );

    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    expect(dispose).not.toHaveBeenCalled();

    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps rendering when config-manager init rejects', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    init.mockRejectedValue(new Error('indexeddb unavailable'));

    render(
      <WidgetHost apiUrl="" userId="k123" platform={fakePlatform}>
        <HostReadout />
      </WidgetHost>,
    );

    // The tree must stay usable — a failed init downgrades to no persistence,
    // it does not blank the widget.
    expect(screen.getByText('k123')).toBeDefined();
    await waitFor(() => expect(error).toHaveBeenCalledWith('ConfigManager init failed', expect.any(Error)));
  });

  it('does not create a new config manager when only children change', () => {
    const { rerender } = render(
      <WidgetHost apiUrl="https://cfg.example" userId="k123" platform={fakePlatform}>
        <HostReadout />
      </WidgetHost>,
    );
    rerender(
      <WidgetHost apiUrl="https://cfg.example" userId="k123" platform={fakePlatform}>
        <p>different children</p>
      </WidgetHost>,
    );

    // A second manager would mean a second Dexie connection and a second
    // seed load on every parent re-render.
    expect(createConfigManager).toHaveBeenCalledTimes(1);
  });
});

describe('useWidgetHost', () => {
  it('throws outside a provider rather than handing back a half-built context', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useWidgetHost())).toThrow(
      'useWidgetHost must be used within a <WidgetHost> provider',
    );
  });
});
