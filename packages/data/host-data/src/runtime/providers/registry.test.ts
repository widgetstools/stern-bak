import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@wellsfargo-starui/types';

const startMock = vi.fn(() => ({ stop: vi.fn(), restart: vi.fn() }));
const startStomp = vi.fn(() => ({ stop: vi.fn(), restart: vi.fn() }));
const startRest = vi.fn(() => ({ stop: vi.fn(), restart: vi.fn() }));
const perspectiveHandle = () => ({
  stop: vi.fn(),
  restart: vi.fn(),
  feed: null,
  tableName: 'positions',
});
const startStompPerspective = vi.fn(perspectiveHandle);
const startMockPerspective = vi.fn(perspectiveHandle);

vi.mock('./transports/mock.js', () => ({
  startMock: (...args: unknown[]) => startMock(...args),
}));
vi.mock('./transports/stomp.js', () => ({
  startStomp: (...args: unknown[]) => startStomp(...args),
}));
vi.mock('./transports/rest.js', () => ({
  startRest: (...args: unknown[]) => startRest(...args),
}));
// Bound directly rather than through a forwarding arrow: the registry compares
// the registered factory against this exact reference to decide whether a
// caller has overridden it.
vi.mock('./transports/stompPerspective.js', () => ({
  startStompPerspective: (...args: unknown[]) => startStompPerspective(...args),
}));
vi.mock('./transports/mockPerspective.js', () => ({
  startMockPerspective,
}));

const { startProvider, registerProvider } = await import('./registry.js');

const emit = vi.fn();

const mockCfg = (): ProviderConfig => ({
  providerType: 'mock',
  keyColumn: 'id',
  columnDefinitions: [{ field: 'id', headerName: 'ID' }],
});

describe('startProvider', () => {
  beforeEach(() => {
    startMock.mockClear();
    startStomp.mockClear();
    startRest.mockClear();
    emit.mockClear();
  });

  it('throws when no factory is registered for the provider type', () => {
    expect(() =>
      startProvider({ providerType: 'unknown' } as never, emit),
    ).toThrow("[data-services] No provider factory registered for type 'unknown'");
  });

  it('dispatches STOMP through startStomp even when appDataLookup is supplied', () => {
    const lookup = vi.fn();
    const cfg: ProviderConfig = {
      providerType: 'stomp',
      keyColumn: 'id',
      columnDefinitions: [{ field: 'id', headerName: 'ID' }],
      brokerUrl: 'ws://localhost',
      destination: '/topic/x',
    };

    startProvider(cfg, emit, { appDataLookup: lookup });

    expect(startStomp).toHaveBeenCalledWith(
      cfg,
      emit,
      expect.objectContaining({ appDataLookup: lookup }),
    );
    expect(startMock).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('throws when appData tokens remain unresolved for mock/rest providers', () => {
    const cfg: ProviderConfig = {
      providerType: 'mock',
      keyColumn: 'id',
      columnDefinitions: [{ field: 'id', headerName: 'ID' }],
      brokerUrl: '{{missing.token}}',
    } as ProviderConfig;

    expect(() =>
      startProvider(cfg, emit, { appDataLookup: () => undefined }),
    ).toThrow(/mock provider cfg/);
  });

  it('resolves appData tokens before dispatching non-stomp factories', () => {
    const cfg: ProviderConfig = {
      providerType: 'mock',
      keyColumn: 'id',
      columnDefinitions: [{ field: 'id', headerName: 'ID' }],
    };

    startProvider(cfg, emit, {
      appDataLookup: (name, key) => (name === 'App1' && key === 'userId' ? 'u1' : undefined),
    });

    expect(startMock).toHaveBeenCalled();
  });

  it('allows registerProvider to override the default factory', () => {
    const custom = vi.fn(() => ({ stop: vi.fn(), restart: vi.fn() }));
    registerProvider('mock', custom);

    startProvider(mockCfg(), emit);

    expect(custom).toHaveBeenCalled();
  });
});

describe('startProvider — Perspective providers', () => {
  const perspectiveHost = { tableFactoryFor: vi.fn() } as never;

  beforeEach(() => {
    startStompPerspective.mockClear();
    startMockPerspective.mockClear();
    startStomp.mockClear();
    startMock.mockClear();
    emit.mockClear();
  });

  // It IS a STOMP config, so it gets the same AppData/bracket treatment as
  // `stomp` — plus the host the Table is created on.
  it('dispatches stomp-perspective with appDataLookup and the host', () => {
    const lookup = vi.fn();
    const cfg = {
      providerType: 'stomp-perspective',
      keyColumn: 'id',
      websocketUrl: 'ws://localhost',
      listenerTopic: '/topic/x',
    } as unknown as ProviderConfig;

    startProvider(cfg, emit, { appDataLookup: lookup, perspectiveHost });

    expect(startStompPerspective).toHaveBeenCalledWith(
      cfg,
      emit,
      expect.objectContaining({ appDataLookup: lookup, perspectiveHost }),
    );
    expect(startStomp).not.toHaveBeenCalled();
  });

  // The generator takes no connection settings, so there is nothing for an
  // AppData token to appear in.
  it('dispatches mock-perspective with the host and no appDataLookup', () => {
    const cfg = {
      providerType: 'mock-perspective',
      dataType: 'positions',
      keyColumn: 'id',
      columnDefinitions: [{ field: 'id', headerName: 'ID' }],
    } as unknown as ProviderConfig;

    startProvider(cfg, emit, { appDataLookup: vi.fn(), perspectiveHost });

    expect(startMockPerspective).toHaveBeenCalledWith(
      cfg,
      emit,
      expect.objectContaining({ perspectiveHost }),
    );
    expect(startMockPerspective.mock.calls[0]![2]).not.toHaveProperty('appDataLookup');
    expect(startMock).not.toHaveBeenCalled();
  });

  it('runs both without a host — they serve the push path only', () => {
    startProvider(
      { providerType: 'stomp-perspective', keyColumn: 'id' } as unknown as ProviderConfig,
      emit,
    );
    expect(startStompPerspective.mock.calls[0]![2]).toEqual(
      expect.objectContaining({ perspectiveHost: undefined }),
    );
  });

  /**
   * The early return above must not swallow `registerProvider`. Without this
   * carve-out a test (or an app) that installs its own `mock-perspective`
   * factory would silently keep getting the built-in one.
   */
  it('lets a registered mock-perspective factory win over the built-in', () => {
    const custom = vi.fn(() => ({ stop: vi.fn(), restart: vi.fn() }));
    registerProvider('mock-perspective', custom);

    const cfg = {
      providerType: 'mock-perspective',
      dataType: 'positions',
      keyColumn: 'id',
    } as unknown as ProviderConfig;
    startProvider(cfg, emit);

    expect(custom).toHaveBeenCalled();
    expect(startMockPerspective).not.toHaveBeenCalled();
  });
});
