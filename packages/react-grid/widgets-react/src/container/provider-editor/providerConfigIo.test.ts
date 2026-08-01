import { describe, expect, it, vi, afterEach } from 'vitest';
import type { DataProviderConfig } from '@wellsfargo-starui/types/shared';
import {
  exportProviderConfig,
  parseProviderConfigImport,
  toPortableProviderConfig,
} from './providerConfigIo.js';

const base: DataProviderConfig = {
  providerId: 'p-1',
  name: 'STOMP Positions',
  description: 'Live feed',
  providerType: 'stomp',
  userId: 'dev1',
  public: true,
  isDefault: true,
  config: {
    providerType: 'stomp',
    websocketUrl: 'ws://localhost:8081',
    listenerTopic: '/snapshot/positions/T1',
    columnDefinitions: [{ field: 'positionId', headerName: 'Position Id', cellDataType: 'text' }],
    keyColumn: 'positionId',
  } as DataProviderConfig['config'],
};

// Mirror the export envelope produced by exportProviderConfig (which
// can't run here — no DOM download). The portable provider is the part
// that round-trips.
function exportEnvelope(provider: DataProviderConfig): string {
  return JSON.stringify({
    kind: 'starui.dataProvider',
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    provider: toPortableProviderConfig(provider),
  });
}

describe('toPortableProviderConfig', () => {
  it('drops identity/ownership fields and deep-clones', () => {
    const portable = toPortableProviderConfig(base);
    expect(portable).not.toHaveProperty('providerId');
    expect(portable).not.toHaveProperty('userId');
    expect(portable).not.toHaveProperty('isDefault');
    expect(portable.name).toBe('STOMP Positions');
    expect(portable.public).toBe(true);
    expect(portable.config).toEqual(base.config);
    expect(portable.config).not.toBe(base.config);
  });
});

describe('parseProviderConfigImport', () => {
  it('round-trips a wrapped export envelope', () => {
    const parsed = parseProviderConfigImport(exportEnvelope(base));
    expect(parsed.name).toBe('STOMP Positions');
    expect(parsed.providerType).toBe('stomp');
    expect(parsed.config).toEqual(base.config);
    expect(parsed).not.toHaveProperty('providerId');
    expect(parsed).not.toHaveProperty('userId');
  });

  it('accepts a bare provider object and strips identity', () => {
    const parsed = parseProviderConfigImport(JSON.stringify(base));
    expect(parsed.providerType).toBe('stomp');
    expect(parsed).not.toHaveProperty('providerId');
    expect(parsed).not.toHaveProperty('userId');
    expect(parsed).not.toHaveProperty('isDefault');
  });

  it('defaults a missing name', () => {
    const parsed = parseProviderConfigImport(
      JSON.stringify({ providerType: 'mock', config: { providerType: 'mock' } }),
    );
    expect(parsed.name).toBe('imported provider');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseProviderConfigImport('{not json')).toThrow(/valid JSON/);
  });

  it('throws when providerType is missing', () => {
    expect(() => parseProviderConfigImport(JSON.stringify({ config: {} }))).toThrow(/providerType/);
  });

  it('throws when config is missing', () => {
    expect(() => parseProviderConfigImport(JSON.stringify({ providerType: 'stomp' }))).toThrow(/config/);
  });
});

describe('exportProviderConfig', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('downloads a portable JSON envelope with a sanitized filename stem', () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.body);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click,
      remove,
    } as unknown as HTMLAnchorElement);

    exportProviderConfig({
      ...base,
      name: 'STOMP Positions!!!',
    });

    expect(click).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    expect(appendChild).toHaveBeenCalled();
    const anchor = (document.createElement as ReturnType<typeof vi.fn>).mock.results[0]?.value as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^starui-data-provider-stomp-positions.*\.json$/);
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
