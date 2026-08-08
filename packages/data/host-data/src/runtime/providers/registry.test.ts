import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@wellsfargo-starui/types';

const startMock = vi.fn(() => ({ stop: vi.fn(), restart: vi.fn() }));
const startStomp = vi.fn(() => ({ stop: vi.fn(), restart: vi.fn() }));
const startRest = vi.fn(() => ({ stop: vi.fn(), restart: vi.fn() }));

vi.mock('./transports/mock.js', () => ({
  startMock: (...args: unknown[]) => startMock(...args),
}));
vi.mock('./transports/stomp.js', () => ({
  startStomp: (...args: unknown[]) => startStomp(...args),
}));
vi.mock('./transports/rest.js', () => ({
  startRest: (...args: unknown[]) => startRest(...args),
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

  it('dispatches stomp-ssrm through the same startStomp factory', () => {
    const cfg: ProviderConfig = {
      providerType: 'stomp-ssrm',
      keyColumn: 'id',
      columnDefinitions: [{ field: 'id', headerName: 'ID' }],
      websocketUrl: 'ws://localhost',
      listenerTopic: '/topic/x',
    } as ProviderConfig;

    startProvider(cfg, emit);

    expect(startStomp).toHaveBeenCalledWith(
      cfg,
      emit,
      expect.objectContaining({ appDataLookup: undefined }),
    );
    expect(startMock).not.toHaveBeenCalled();
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
