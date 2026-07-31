/**
 * Format invariant for `mintRegisteredInstanceId`. The id format is a
 * load-bearing contract — Config Browser scans, `startsWith` filters,
 * and human visual scanning all depend on it. Locking it down here so
 * a future "let's just use a UUID again" doesn't slip through.
 *
 * Format: `${userId}${componentType}-${componentSubType}-${Date.now()}`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mintRegisteredInstanceId } from './registryConfigTypes';

describe('mintRegisteredInstanceId', () => {
  const FIXED_NOW = 1714999999999;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces userId + componentType + "-" + componentSubType + "-" + Date.now()', () => {
    const id = mintRegisteredInstanceId('dev1', 'blotter', 'markets');
    expect(id).toBe(`dev1blotter-markets-${FIXED_NOW}`);
  });

  it('handles an empty componentSubType — leaves a bare double-dash gap', () => {
    const id = mintRegisteredInstanceId('dev1', 'orderbook', '');
    expect(id).toBe(`dev1orderbook--${FIXED_NOW}`);
  });

  it('preserves casing — the helper does NOT lowercase componentType / componentSubType', () => {
    // Lowercasing is the template configId's job (deriveTemplateConfigId).
    // Instance ids reflect the registered entry verbatim so support staff
    // can scan them at-a-glance.
    const id = mintRegisteredInstanceId('dev1', 'OrderBook', 'EU');
    expect(id).toBe(`dev1OrderBook-EU-${FIXED_NOW}`);
  });

  it('two calls in the same millisecond produce identical ids — caller must guard against double-launch', () => {
    const a = mintRegisteredInstanceId('dev1', 'blotter', 'markets');
    const b = mintRegisteredInstanceId('dev1', 'blotter', 'markets');
    expect(a).toBe(b);
  });

  it('two calls one ms apart produce different, sortable ids', () => {
    const a = mintRegisteredInstanceId('dev1', 'blotter', 'markets');
    vi.setSystemTime(FIXED_NOW + 1);
    const b = mintRegisteredInstanceId('dev1', 'blotter', 'markets');
    expect(a).not.toBe(b);
    expect(a < b).toBe(true);
  });
});
