import { describe, expect, it } from 'vitest';
import type { DataProviderConfig } from '@wellsfargo-starui/shared-types';
import { cloneProviderConfig, copyNameFrom } from './cloneProviderConfig.js';

const base: DataProviderConfig = {
  providerId: 'p-1',
  name: 'STOMP Positions',
  description: 'Live feed',
  providerType: 'stomp',
  userId: 'dev1',
  public: false,
  isDefault: true,
  config: {
    providerType: 'stomp',
    websocketUrl: 'ws://localhost:8081',
    listenerTopic: '/snapshot/positions/T1',
  },
};

describe('copyNameFrom', () => {
  it('appends (copy) to a plain name', () => {
    expect(copyNameFrom('STOMP Positions')).toBe('STOMP Positions (copy)');
  });

  it('replaces an existing copy suffix', () => {
    expect(copyNameFrom('STOMP Positions (copy)')).toBe('STOMP Positions (copy)');
    expect(copyNameFrom('STOMP Positions (copy 2)')).toBe('STOMP Positions (copy)');
  });

  it('uses untitled when the source name is blank', () => {
    expect(copyNameFrom('   ')).toBe('untitled (copy)');
    expect(copyNameFrom('')).toBe('untitled (copy)');
  });
});

describe('cloneProviderConfig', () => {
  it('drops id/default and deep-clones transport cfg', () => {
    const cloned = cloneProviderConfig(base, 'dev2');
    expect(cloned.providerId).toBeUndefined();
    expect(cloned.isDefault).toBe(false);
    expect(cloned.name).toBe('STOMP Positions (copy)');
    expect(cloned.userId).toBe('dev2');
    expect(cloned.description).toBe('Live feed');
    expect(cloned.config).toEqual(base.config);
    expect(cloned.config).not.toBe(base.config);
  });
});
