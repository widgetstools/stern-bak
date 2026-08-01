import { describe, it, expect } from 'vitest';
import type { DataProviderConfig } from '@wellsfargo-starui/types/shared';
import {
  buildProviderSidebarConfigs,
  isDraftListId,
  toDraftListId,
} from './providerSidebarList.js';

const saved: DataProviderConfig = {
  providerId: 'p1',
  name: 'test.dp',
  providerType: 'stomp',
  config: { providerType: 'stomp' },
  userId: 'dev1',
};

describe('buildProviderSidebarConfigs', () => {
  it('prepends an unsaved draft clone to the sidebar list', () => {
    const draft: DataProviderConfig = {
      name: 'test.dp (copy)',
      providerType: 'stomp',
      config: { providerType: 'stomp' },
      userId: 'dev1',
    };
    const rows = buildProviderSidebarConfigs([saved], draft, 3, '');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe('test.dp (copy)');
    expect(rows[0]?.providerId).toBe(toDraftListId(3));
    expect(rows[1]?.providerId).toBe('p1');
  });

  it('hides the draft when it does not match the search filter', () => {
    const draft: DataProviderConfig = {
      name: 'other (copy)',
      providerType: 'stomp',
      config: { providerType: 'stomp' },
      userId: 'dev1',
    };
    const rows = buildProviderSidebarConfigs([saved], draft, 1, 'test.dp');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.providerId).toBe('p1');
  });
});

describe('isDraftListId', () => {
  it('recognises synthetic draft ids', () => {
    expect(isDraftListId(toDraftListId(1))).toBe(true);
    expect(isDraftListId('p1')).toBe(false);
  });
});
