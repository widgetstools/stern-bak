import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ProviderConfig } from '@wellsfargo-starui/types';

const mockProbeStomp = vi.fn();
const mockProbeRest = vi.fn();
vi.mock('@wellsfargo-starui/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/data')>();
  return { ...actual, probeStomp: (...args: unknown[]) => mockProbeStomp(...args), probeRest: (...args: unknown[]) => mockProbeRest(...args) };
});

import { probeAndInferFields, suggestedColumns, columnsForPaths, type InferredField } from './providerColumns';

beforeEach(() => {
  mockProbeStomp.mockReset();
  mockProbeRest.mockReset();
});

const STOMP_CFG = { providerType: 'stomp', websocketUrl: 'wss://x', listenerTopic: '/t', keyColumn: 'id' } as ProviderConfig;
const REST_CFG = { providerType: 'rest', baseUrl: 'https://x', endpoint: '/y', method: 'GET', keyColumn: 'id' } as ProviderConfig;

describe('probeAndInferFields', () => {
  it('probes a stomp feed and infers its fields from the sampled rows', async () => {
    mockProbeStomp.mockResolvedValue({ ok: true, rows: [{ id: '1', price: 100 }, { id: '2', price: 101 }] });

    const result = await probeAndInferFields(STOMP_CFG, { sampleSize: 50 });

    expect(mockProbeStomp).toHaveBeenCalledWith(STOMP_CFG, { maxRows: 50 });
    expect(mockProbeRest).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.map((f) => f.path).sort()).toEqual(['id', 'price']);
      expect(result.rowsUsed).toBe(2);
    }
  });

  it('probes a rest feed without a maxRows option — one snapshot fetch, not a bounded stream', async () => {
    mockProbeRest.mockResolvedValue({ ok: true, rows: [{ id: '1' }] });

    const result = await probeAndInferFields(REST_CFG);

    expect(mockProbeRest).toHaveBeenCalledWith(REST_CFG);
    expect(mockProbeStomp).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('passes a transport failure straight through', async () => {
    mockProbeStomp.mockResolvedValue({ ok: false, error: 'connection timed out' });

    const result = await probeAndInferFields(STOMP_CFG);

    expect(result).toEqual({ ok: false, error: 'connection timed out' });
  });

  it('gives a generic message when the transport fails without one', async () => {
    mockProbeStomp.mockResolvedValue({ ok: false });

    const result = await probeAndInferFields(STOMP_CFG);

    expect(result).toEqual({ ok: false, error: 'Probe failed.' });
  });

  it.each(['mock', 'appdata', 'websocket', 'socketio'] as const)(
    'refuses %s without touching either transport',
    async (providerType) => {
      const result = await probeAndInferFields({ providerType } as ProviderConfig);

      expect(result.ok).toBe(false);
      expect(mockProbeStomp).not.toHaveBeenCalled();
      expect(mockProbeRest).not.toHaveBeenCalled();
    },
  );
});

describe('suggestedColumns', () => {
  const TREE: InferredField[] = [
    { path: 'z', name: 'z', type: 'string' },
    {
      path: 'meta',
      name: 'meta',
      type: 'object',
      children: [{ path: 'meta.region', name: 'region', type: 'string' }],
    },
    { path: 'a', name: 'a', type: 'number' },
  ];

  it('orders shallow (top-level) fields before nested ones', () => {
    expect(suggestedColumns(TREE).map((c) => c.field)).toEqual(['z', 'a', 'meta.region']);
  });

  it('preserves discovery order within the same depth — a stable sort, not alphabetical', () => {
    const fields = suggestedColumns(TREE).map((c) => c.field);
    expect(fields.indexOf('z')).toBeLessThan(fields.indexOf('a'));
  });

  it('caps at maxColumns', () => {
    const many: InferredField[] = Array.from({ length: 10 }, (_, i) => ({ path: `f${i}`, name: `f${i}`, type: 'number' as const }));
    expect(suggestedColumns(many, { maxColumns: 3 })).toHaveLength(3);
  });

  it('defaults the cap to 40', () => {
    const many: InferredField[] = Array.from({ length: 50 }, (_, i) => ({ path: `f${i}`, name: `f${i}`, type: 'number' as const }));
    expect(suggestedColumns(many)).toHaveLength(40);
  });
});

describe('columnsForPaths', () => {
  const TREE: InferredField[] = [
    { path: 'a', name: 'a', type: 'string' },
    { path: 'b', name: 'b', type: 'number' },
  ];

  it('resolves known paths to columns', () => {
    const { columns, unknown } = columnsForPaths(TREE, ['a']);
    expect(columns).toHaveLength(1);
    expect(columns[0].field).toBe('a');
    expect(unknown).toEqual([]);
  });

  it('reports an unknown path separately rather than dropping it silently', () => {
    const { columns, unknown } = columnsForPaths(TREE, ['a', 'zzz']);
    expect(columns.map((c) => c.field)).toEqual(['a']);
    expect(unknown).toEqual(['zzz']);
  });

  it('reports every unknown path when none match', () => {
    const { columns, unknown } = columnsForPaths(TREE, ['nope', 'also-nope']);
    expect(columns).toEqual([]);
    expect(unknown).toEqual(['nope', 'also-nope']);
  });
});
