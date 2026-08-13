import { beforeEach, describe, expect, it } from 'vitest';
import {
  COMPONENT_SUBTYPE_TO_PROVIDER_TYPE,
  COMPOSITE_KEY_SEPARATOR,
  CONNECTION_STATES,
  DEFAULT_PROVIDER_CONFIGS,
  PROVIDER_TYPES,
  PROVIDER_TYPE_TO_COMPONENT_SUBTYPE,
  __resetPathAccessorCaches,
  composeRowId,
  getDefaultProviderConfig,
  getPathAccessor,
  getPathSetter,
  getValueByPath,
  normalizeKeyColumns,
  validateProviderConfig,
  type ProviderConfig,
  type ProviderType,
} from './dataProvider.js';

beforeEach(() => {
  __resetPathAccessorCaches();
});

describe('provider-type maps', () => {
  it('maps every provider type to a componentSubType', () => {
    for (const type of Object.values(PROVIDER_TYPES)) {
      expect(PROVIDER_TYPE_TO_COMPONENT_SUBTYPE[type]).toBe(type);
    }
  });

  it('round-trips componentSubType back to the provider type', () => {
    for (const type of Object.values(PROVIDER_TYPES)) {
      const subtype = PROVIDER_TYPE_TO_COMPONENT_SUBTYPE[type];
      expect(COMPONENT_SUBTYPE_TO_PROVIDER_TYPE[subtype]).toBe(type);
    }
  });

  it('accepts the capitalised legacy subtypes written by older configs', () => {
    expect(COMPONENT_SUBTYPE_TO_PROVIDER_TYPE['Stomp']).toBe('stomp');
    expect(COMPONENT_SUBTYPE_TO_PROVIDER_TYPE['AppData']).toBe('appdata');
  });

  it('returns undefined for an unknown subtype rather than a wrong type', () => {
    expect(COMPONENT_SUBTYPE_TO_PROVIDER_TYPE['kafka']).toBeUndefined();
  });

  it('pins the connection-state strings surfaced to status UIs', () => {
    expect(CONNECTION_STATES).toEqual({
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting',
      CONNECTED: 'connected',
      RECONNECTING: 'reconnecting',
      ERROR: 'error',
    });
  });
});

describe('getDefaultProviderConfig', () => {
  it('has a default entry for every provider type, tagged with its own type', () => {
    for (const type of Object.values(PROVIDER_TYPES)) {
      expect(getDefaultProviderConfig(type).providerType).toBe(type);
    }
  });

  it('returns a fresh object so an editor mutating it cannot poison the table', () => {
    const first = getDefaultProviderConfig('mock') as { rowCount?: number };
    first.rowCount = 9999;
    expect((getDefaultProviderConfig('mock') as { rowCount?: number }).rowCount).toBe(20);
    expect(DEFAULT_PROVIDER_CONFIGS.mock).not.toBe(first);
  });

  it('is a shallow copy — nested objects are still shared', () => {
    // Documented hazard: the stomp default's `heartbeat` object is
    // aliased, so an editor writing through it WOULD mutate the table.
    const a = getDefaultProviderConfig('stomp') as { heartbeat?: object };
    const b = getDefaultProviderConfig('stomp') as { heartbeat?: object };
    expect(a.heartbeat).toBe(b.heartbeat);
  });

  it('returns an empty object for an unknown type instead of throwing', () => {
    expect(getDefaultProviderConfig('kafka' as ProviderType)).toEqual({});
  });
});

describe('validateProviderConfig', () => {
  it('reports an error when providerType is missing', () => {
    const result = validateProviderConfig({} as ProviderConfig);
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(['Provider type is required']);
  });

  it('accepts a well-formed stomp config with no warnings', () => {
    const result = validateProviderConfig({
      providerType: 'stomp',
      websocketUrl: 'wss://feed/ws',
      snapshotTimeoutMs: 60000,
    } as ProviderConfig);
    expect(result).toEqual({ isValid: true, errors: [], warnings: undefined });
  });

  it('warns — but stays valid — on a non-ws stomp URL', () => {
    const result = validateProviderConfig({
      providerType: 'stomp',
      websocketUrl: 'https://feed/ws',
    } as ProviderConfig);
    expect(result.isValid).toBe(true);
    expect(result.warnings).toEqual([
      'WebSocket URL should typically start with ws:// or wss://',
    ]);
  });

  it('warns on a sub-second stomp snapshot timeout', () => {
    const result = validateProviderConfig({
      providerType: 'stomp',
      snapshotTimeoutMs: 500,
    } as ProviderConfig);
    expect(result.warnings).toEqual(['Snapshot timeout is very low (< 1 second)']);
  });

  it('collects both stomp warnings at once', () => {
    const result = validateProviderConfig({
      providerType: 'stomp',
      websocketUrl: 'http://feed',
      snapshotTimeoutMs: 1,
    } as ProviderConfig);
    expect(result.warnings).toHaveLength(2);
  });

  it('warns on a non-http rest base URL and a sub-second poll interval', () => {
    const result = validateProviderConfig({
      providerType: 'rest',
      baseUrl: 'ftp://host',
      pollInterval: 100,
    } as ProviderConfig);
    expect(result.warnings).toEqual([
      'Base URL should typically start with http:// or https://',
      'Poll interval is very low (< 1 second), may cause high server load',
    ]);
  });

  it('accepts an https rest base URL', () => {
    const result = validateProviderConfig({
      providerType: 'rest',
      baseUrl: 'https://host',
      pollInterval: 5000,
    } as ProviderConfig);
    expect(result.warnings).toBeUndefined();
  });

  it('has no per-type rules for mock / appdata', () => {
    for (const providerType of ['mock', 'appdata'] as const) {
      const result = validateProviderConfig({ providerType } as ProviderConfig);
      expect(result).toEqual({ isValid: true, errors: [], warnings: undefined });
    }
  });
});

describe('normalizeKeyColumns', () => {
  it('returns null for null / undefined', () => {
    expect(normalizeKeyColumns(null)).toBeNull();
    expect(normalizeKeyColumns(undefined)).toBeNull();
  });

  it('wraps a single string in an array', () => {
    expect(normalizeKeyColumns('cusip')).toEqual(['cusip']);
  });

  it('trims and drops empty entries', () => {
    expect(normalizeKeyColumns(['  cusip  ', '', '   ', 'account'])).toEqual(['cusip', 'account']);
  });

  it('returns null when every entry is empty — an all-blank key is unusable', () => {
    expect(normalizeKeyColumns(['', '   '])).toBeNull();
    expect(normalizeKeyColumns('   ')).toBeNull();
  });

  it('drops non-string entries', () => {
    expect(normalizeKeyColumns([1, 'cusip', null] as unknown as string[])).toEqual(['cusip']);
  });

  it('returns null for a non-string, non-array value', () => {
    expect(normalizeKeyColumns(42 as unknown as string)).toBeNull();
    expect(normalizeKeyColumns({} as unknown as string)).toBeNull();
  });

  it('memoizes strings by value — hot paths must not reallocate per row', () => {
    expect(normalizeKeyColumns('cusip')).toBe(normalizeKeyColumns('cusip'));
  });

  it('memoizes arrays by reference; a fresh array is a cache miss', () => {
    const cols = ['a', 'b'];
    expect(normalizeKeyColumns(cols)).toBe(normalizeKeyColumns(cols));
    expect(normalizeKeyColumns(['a', 'b'])).not.toBe(normalizeKeyColumns(['a', 'b']));
  });
});

describe('getValueByPath', () => {
  it('reads a top-level field', () => {
    expect(getValueByPath({ px: 101.5 }, 'px')).toBe(101.5);
  });

  it('dot-walks nested objects', () => {
    expect(getValueByPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1);
  });

  it('prefers a literal flat key containing dots over the dot-walk', () => {
    // Some upstream feeds legitimately encode dots in keys; losing that
    // data to a dot-walk would silently mis-key the row.
    expect(getValueByPath({ 'weird.key': 'literal', weird: { key: 'walked' } }, 'weird.key'))
      .toBe('literal');
  });

  it('returns undefined for a missing segment mid-walk', () => {
    expect(getValueByPath({ a: { b: 1 } }, 'a.b.c')).toBeUndefined();
    expect(getValueByPath({ a: null }, 'a.b')).toBeUndefined();
  });

  it('returns undefined for a single-segment miss without walking', () => {
    expect(getValueByPath({ a: 1 }, 'b')).toBeUndefined();
  });

  it('returns undefined for non-object roots', () => {
    expect(getValueByPath(null, 'a')).toBeUndefined();
    expect(getValueByPath(undefined, 'a')).toBeUndefined();
    expect(getValueByPath('str', 'length')).toBeUndefined();
    expect(getValueByPath(7, 'a')).toBeUndefined();
  });

  it('returns an own property holding undefined as undefined (indistinguishable from a miss)', () => {
    expect(getValueByPath({ a: undefined }, 'a')).toBeUndefined();
  });
});

describe('getPathAccessor', () => {
  it('returns the identical closure for the same path — callers memoize on it', () => {
    expect(getPathAccessor('a.b')).toBe(getPathAccessor('a.b'));
    expect(getPathAccessor('a.b')).not.toBe(getPathAccessor('a.c'));
  });

  it('reads single-segment paths', () => {
    const read = getPathAccessor('px');
    expect(read({ px: 3 })).toBe(3);
    expect(read({})).toBeUndefined();
    expect(read(null)).toBeUndefined();
    expect(read(5)).toBeUndefined();
  });

  it('matches getValueByPath on nested paths, literal keys included', () => {
    const read = getPathAccessor('a.b.c');
    expect(read({ a: { b: { c: 9 } } })).toBe(9);
    expect(read({ 'a.b.c': 'literal' })).toBe('literal');
    expect(read({ a: { b: null } })).toBeUndefined();
    expect(read(null)).toBeUndefined();
  });

  it('drops its cache on __resetPathAccessorCaches', () => {
    const before = getPathAccessor('a.b');
    __resetPathAccessorCaches();
    expect(getPathAccessor('a.b')).not.toBe(before);
  });
});

describe('getPathSetter', () => {
  it('returns the identical closure for the same path', () => {
    expect(getPathSetter('a.b')).toBe(getPathSetter('a.b'));
  });

  it('writes a single-segment path and reports whether the value changed', () => {
    const write = getPathSetter('px');
    const row: Record<string, unknown> = { px: 1 };
    expect(write(row, 2)).toBe(true);
    expect(row.px).toBe(2);
    expect(write(row, 2)).toBe(false);
  });

  it('refuses non-object roots', () => {
    expect(getPathSetter('px')(null, 1)).toBe(false);
    expect(getPathSetter('a.b')(null, 1)).toBe(false);
    expect(getPathSetter('px')(7, 1)).toBe(false);
  });

  it('creates intermediate objects on a nested write', () => {
    const write = getPathSetter('a.b.c');
    const row: Record<string, unknown> = {};
    expect(write(row, 5)).toBe(true);
    expect(row).toEqual({ a: { b: { c: 5 } } });
  });

  it('replaces a non-object intermediate rather than throwing', () => {
    const row: Record<string, unknown> = { a: 'scalar' };
    expect(getPathSetter('a.b')(row, 1)).toBe(true);
    expect(row).toEqual({ a: { b: 1 } });
  });

  it('reports false for a nested no-op write', () => {
    const row = { a: { b: 1 } };
    expect(getPathSetter('a.b')(row, 1)).toBe(false);
  });

  it('does NOT honour the literal-flat-key read priority — writes are structural', () => {
    const row: Record<string, unknown> = { 'a.b': 'literal' };
    expect(getPathSetter('a.b')(row, 'written')).toBe(true);
    expect(row).toEqual({ 'a.b': 'literal', a: { b: 'written' } });
  });

  it('treats NaN → NaN as a no-op (Object.is semantics)', () => {
    const row = { px: Number.NaN };
    expect(getPathSetter('px')(row, Number.NaN)).toBe(false);
  });
});

describe('composeRowId', () => {
  it('stringifies a single key column', () => {
    expect(composeRowId({ cusip: 'US001' }, 'cusip')).toBe('US001');
    expect(composeRowId({ id: 42 }, 'id')).toBe('42');
  });

  it('joins composite key columns with the documented separator', () => {
    expect(composeRowId({ a: 'A', b: 'B', c: 42 }, ['a', 'b', 'c'])).toBe('A-B-42');
    expect(COMPOSITE_KEY_SEPARATOR).toBe('-');
  });

  it('resolves nested key columns through the dot-walk', () => {
    expect(composeRowId({ meta: { id: 'POS-42' } }, 'meta.id')).toBe('POS-42');
  });

  it('returns null when ANY composite column is missing', () => {
    // A partial composite would collapse distinct rows onto "A--42".
    expect(composeRowId({ a: 'A', c: 42 }, ['a', 'b', 'c'])).toBeNull();
    expect(composeRowId({ a: 'A', b: null }, ['a', 'b'])).toBeNull();
  });

  it('returns null when the single key column is missing or null', () => {
    expect(composeRowId({ other: 1 }, 'cusip')).toBeNull();
    expect(composeRowId({ cusip: null }, 'cusip')).toBeNull();
    expect(composeRowId({ cusip: undefined }, 'cusip')).toBeNull();
  });

  it('keeps falsy-but-present values — 0 and "" are legitimate ids', () => {
    expect(composeRowId({ id: 0 }, 'id')).toBe('0');
    expect(composeRowId({ id: '' }, 'id')).toBe('');
    expect(composeRowId({ id: false }, 'id')).toBe('false');
  });

  it('returns null with no configured key column', () => {
    expect(composeRowId({ id: 1 }, null)).toBeNull();
    expect(composeRowId({ id: 1 }, undefined)).toBeNull();
    expect(composeRowId({ id: 1 }, [])).toBeNull();
    expect(composeRowId({ id: 1 }, '  ')).toBeNull();
  });

  it('returns null for non-object rows', () => {
    expect(composeRowId(null, 'id')).toBeNull();
    expect(composeRowId('row', 'id')).toBeNull();
  });

  it('collapses to the single-column path once blanks are trimmed away', () => {
    expect(composeRowId({ a: 'A' }, ['a', '  '])).toBe('A');
  });
});
