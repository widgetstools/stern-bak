import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { curatedColumns, mockDataset } from '@wellsfargo-starui/data';
import type { InferredField } from './providerColumns';

/**
 * `probeAndInferFields` is the one seam that dials a real connection —
 * mocked here so these tests exercise the tool logic (dispatch, curation,
 * error surfacing) without touching the network. Everything else in
 * `./providerColumns` (`suggestedColumns`, `columnsForPaths`,
 * `buildColumnDefinitions`) stays real: they're pure, so running them for
 * real is both cheap and the more faithful test.
 */
const mockProbeAndInferFields = vi.fn();
vi.mock('./providerColumns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./providerColumns')>();
  return { ...actual, probeAndInferFields: (...args: unknown[]) => mockProbeAndInferFields(...args) };
});

import { listMockDatasets, listProviderFields, inferProviderFields, setProviderColumns, FIELD_CELL } from './providerFieldTools';

beforeEach(() => {
  mockProbeAndInferFields.mockReset();
});

function store(provider?: Record<string, unknown>) {
  const save = vi.fn().mockResolvedValue({});
  const get = vi.fn().mockResolvedValue(provider ?? null);
  return { store: { get, save } as unknown as DataProviderConfigStore, get, save };
}

/**
 * `setProviderColumns` reloads the open windows of any blotter bound to the
 * provider, which means walking the registry and each blotter's row. Outside
 * OpenFin nothing reloads, so this double only has to be readable.
 */
function configManager(): ConfigManager {
  return {
    profiles: { loadGridLevelData: vi.fn().mockResolvedValue(null) },
  } as unknown as ConfigManager;
}

const mockProvider = (over: Record<string, unknown> = {}) => ({
  providerId: 'p1',
  name: 'Positions Feed',
  config: { providerType: 'mock', dataType: 'positions', ...over },
});

describe('list_mock_datasets', () => {
  it('offers every dataset with enough detail to choose between them', () => {
    const result = listMockDatasets();
    const datasets = (result.data as { datasets: Array<Record<string, unknown>> }).datasets;

    expect(result.ok).toBe(true);
    expect(datasets.map((d) => d.dataType)).toEqual(['positions', 'trades', 'orders', 'custom']);
    for (const d of datasets) {
      expect(d.description, String(d.dataType)).toBeTruthy();
      expect(d.keyColumn, String(d.dataType)).toBeTruthy();
      expect(Number(d.totalFields)).toBeGreaterThan(0);
    }
  });

  it('reports curated counts, which is what makes the choice meaningful', () => {
    const datasets = (listMockDatasets().data as { datasets: Array<Record<string, number>> }).datasets;
    const positions = datasets.find((d) => (d as unknown as { dataType: string }).dataType === 'positions')!;

    expect(positions.curatedFields).toBeGreaterThanOrEqual(40);
    expect(positions.totalFields).toBeGreaterThan(positions.curatedFields);
  });
});

describe('list_provider_fields', () => {
  it('returns a grouped picker payload for a mock provider', async () => {
    const { store: s } = store(mockProvider());

    const result = await listProviderFields(s, { providerId: 'p1' });
    const payload = result.data as { kind: string; groups: Array<{ group: string; fields: unknown[] }>; selected: string[] };

    expect(result.ok).toBe(true);
    expect(payload.kind).toBe(FIELD_CELL);
    expect(payload.groups.map((g) => g.group)).toContain('Pricing');
    // Groups are what make 256 fields choosable rather than a wall of names.
    expect(payload.groups.length).toBeGreaterThan(4);
  });

  it('browses the catalogue with no provider yet', async () => {
    const { store: s, get } = store();

    const result = await listProviderFields(s, { dataType: 'trades' });

    expect(result.ok).toBe(true);
    expect(get).not.toHaveBeenCalled();
    expect((result.data as { subtitle: string }).subtitle).toContain('Trade blotter');
  });

  it('marks which fields are currently selected', async () => {
    const { store: s } = store(mockProvider({ columnDefinitions: [{ field: 'cusip', headerName: 'CUSIP' }] }));

    const payload = (await listProviderFields(s, { providerId: 'p1' })).data as { selected: string[] };

    expect(payload.selected).toEqual(['cusip']);
  });

  /** A probed STOMP/REST feed has no catalogue, but its saved columns serve. */
  it('falls back to saved columns for a non-mock feed', async () => {
    const { store: s } = store({
      providerId: 'p2',
      name: 'Live STOMP',
      config: { providerType: 'stomp', columnDefinitions: [{ field: 'sym', headerName: 'Symbol' }] },
    });

    const result = await listProviderFields(s, { providerId: 'p2' });

    expect(result.ok).toBe(true);
    expect((result.data as { groups: Array<{ group: string }> }).groups[0].group).toBe('Saved columns');
  });

  it('explains what to do for an unprobed feed rather than returning nothing', async () => {
    const { store: s } = store({ providerId: 'p3', name: 'Raw STOMP', config: { providerType: 'stomp' } });

    const result = await listProviderFields(s, { providerId: 'p3' });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('Probe');
  });

  it('needs something to go on', async () => {
    expect((await listProviderFields(store().store, {})).ok).toBe(false);
  });
});

describe('set_provider_columns', () => {
  it('restores the curated default', async () => {
    const { store: s, save } = store(mockProvider({ columnDefinitions: [{ field: 'cusip' }] }));

    const result = await setProviderColumns(configManager(), s, { providerId: 'p1', preset: 'curated' });

    expect(result.ok).toBe(true);
    const saved = (save.mock.calls[0][0] as { config: { columnDefinitions: Array<{ field: string; hide?: boolean }> } }).config;
    // The curated set, plus the key column carried hidden.
    const visible = saved.columnDefinitions.filter((c) => !c.hide);
    expect(visible.length).toBe(curatedColumns('positions').length);
  });

  it('sets an exact list, in the order given', async () => {
    const { store: s, save } = store(mockProvider());

    await setProviderColumns(configManager(), s, { providerId: 'p1', fields: ['marketValue', 'cusip'] });

    const saved = (save.mock.calls[0][0] as { config: { columnDefinitions: Array<{ field: string; hide?: boolean }> } }).config;
    expect(saved.columnDefinitions.filter((c) => !c.hide).map((c) => c.field)).toEqual(['marketValue', 'cusip']);
  });

  it('adds and removes against the current set', async () => {
    const { store: s, save } = store(
      mockProvider({ columnDefinitions: [{ field: 'cusip' }, { field: 'ticker' }] }),
    );

    await setProviderColumns(configManager(), s, { providerId: 'p1', add: ['oas'], remove: ['ticker'] });

    const saved = (save.mock.calls[0][0] as { config: { columnDefinitions: Array<{ field: string; hide?: boolean }> } }).config;
    expect(saved.columnDefinitions.filter((c) => !c.hide).map((c) => c.field)).toEqual(['cusip', 'oas']);
  });

  /**
   * The hub keys its row cache by keyColumn and silently drops rows that cannot
   * resolve one — losing that column is how a grid ends up mysteriously empty.
   */
  it('keeps the key column even when the caller leaves it out', async () => {
    const { store: s, save } = store(mockProvider());

    const result = await setProviderColumns(configManager(), s, { providerId: 'p1', fields: ['marketValue'] });

    const saved = (save.mock.calls[0][0] as { config: { columnDefinitions: Array<{ field: string; hide?: boolean }> } }).config;
    const key = saved.columnDefinitions.find((c) => c.field === mockDataset('positions').keyColumn);
    // Present so the hub can key on it, hidden because row identity
    // ("91282CAB7-0") is plumbing rather than something a trader reads.
    expect(key).toBeDefined();
    expect(key?.hide).toBe(true);
    expect(result.summary).toContain('keyed on it');
  });

  it('rejects a field that is not in the catalogue rather than dropping it', async () => {
    const { store: s, save } = store(mockProvider());

    const result = await setProviderColumns(configManager(), s, { providerId: 'p1', fields: ['cusip', 'nope'] });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('nope');
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses to leave a provider with no columns', async () => {
    const { store: s, save } = store(mockProvider({ columnDefinitions: [{ field: 'cusip' }] }));

    const result = await setProviderColumns(configManager(), s, { providerId: 'p1', remove: ['cusip'] });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('empty grid');
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses catalogue presets on a feed that is neither mock nor probeable', async () => {
    const { store: s } = store({ providerId: 'p2', name: 'App State', config: { providerType: 'appdata' } });

    const result = await setProviderColumns(configManager(), s, { providerId: 'p2', preset: 'curated' });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('neither');
    expect(mockProbeAndInferFields).not.toHaveBeenCalled();
  });

  it('rejects a call with nothing to change', async () => {
    const { store: s } = store(mockProvider());
    expect((await setProviderColumns(configManager(), s, { providerId: 'p1' })).ok).toBe(false);
  });
});

const stompProvider = (over: Record<string, unknown> = {}) => ({
  providerId: 'p9',
  name: 'Live Prices',
  config: { providerType: 'stomp', websocketUrl: 'wss://x', listenerTopic: '/t', keyColumn: 'id', ...over },
});

const INFERRED: InferredField[] = [
  { path: 'id', name: 'id', type: 'string' },
  { path: 'price', name: 'price', type: 'number' },
  { path: 'symbol', name: 'symbol', type: 'string' },
];

describe('infer_provider_fields', () => {
  it('needs a providerId', async () => {
    expect((await inferProviderFields(store().store, {})).ok).toBe(false);
  });

  it('reports an unknown provider', async () => {
    const result = await inferProviderFields(store(undefined).store, { providerId: 'nope' });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('nope');
  });

  it('redirects a mock provider to list_provider_fields instead of probing', async () => {
    const { store: s } = store(mockProvider());
    const result = await inferProviderFields(s, { providerId: 'p1' });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('list_provider_fields');
    expect(mockProbeAndInferFields).not.toHaveBeenCalled();
  });

  it('refuses appdata — not a row feed', async () => {
    const { store: s } = store({ providerId: 'p2', name: 'App State', config: { providerType: 'appdata' } });
    const result = await inferProviderFields(s, { providerId: 'p2' });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('row feed');
    expect(mockProbeAndInferFields).not.toHaveBeenCalled();
  });

  it.each(['websocket', 'socketio'] as const)('refuses %s — probing not implemented yet', async (providerType) => {
    const { store: s } = store({ providerId: 'p3', name: 'Other', config: { providerType } });
    const result = await inferProviderFields(s, { providerId: 'p3' });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain(providerType);
    expect(mockProbeAndInferFields).not.toHaveBeenCalled();
  });

  it('probes a stomp feed and returns a field picker with a suggested subset, saving nothing', async () => {
    mockProbeAndInferFields.mockResolvedValue({ ok: true, fields: INFERRED, rowsFetched: 40, rowsUsed: 40 });
    const { store: s, save } = store(stompProvider());

    const result = await inferProviderFields(s, { providerId: 'p9', sampleSize: 40 });

    expect(mockProbeAndInferFields).toHaveBeenCalledWith(stompProvider().config, { sampleSize: 40 });
    expect(result.ok).toBe(true);
    const payload = result.data as {
      kind: string; selected: string[]; subtitle: string;
      groups: Array<{ group: string; fields: Array<{ field: string; curated: boolean }> }>;
    };
    expect(payload.kind).toBe(FIELD_CELL);
    expect(payload.groups[0].fields.map((f) => f.field).sort()).toEqual(['id', 'price', 'symbol']);
    // All 3 fields fit well under the 40-column cap, so all are suggested.
    expect(payload.selected.sort()).toEqual(['id', 'price', 'symbol']);
    expect(payload.groups[0].fields.every((f) => f.curated)).toBe(true);
    expect(payload.subtitle).toContain('nothing saved yet');
    expect(save).not.toHaveBeenCalled();
  });

  it('surfaces a probe failure rather than pretending it worked', async () => {
    mockProbeAndInferFields.mockResolvedValue({ ok: false, error: 'connection refused' });
    const { store: s } = store(stompProvider());

    const result = await inferProviderFields(s, { providerId: 'p9' });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('connection refused');
  });
});

describe('set_provider_columns — probed (stomp/rest) providers', () => {
  it('preset "curated" probes the feed and applies the suggested subset', async () => {
    mockProbeAndInferFields.mockResolvedValue({ ok: true, fields: INFERRED, rowsFetched: 40, rowsUsed: 40 });
    const { store: s, save } = store(stompProvider());

    const result = await setProviderColumns(configManager(), s, { providerId: 'p9', preset: 'curated' });

    expect(result.ok).toBe(true);
    const saved = (save.mock.calls[0][0] as { config: { columnDefinitions: Array<{ field: string }> } }).config;
    expect(saved.columnDefinitions.map((c) => c.field).sort()).toEqual(['id', 'price', 'symbol']);
  });

  it('preset "all" probes the feed and applies every inferred field', async () => {
    mockProbeAndInferFields.mockResolvedValue({ ok: true, fields: INFERRED, rowsFetched: 40, rowsUsed: 40 });
    const { store: s, save } = store(stompProvider());

    await setProviderColumns(configManager(), s, { providerId: 'p9', preset: 'all' });

    const saved = (save.mock.calls[0][0] as { config: { columnDefinitions: Array<{ field: string }> } }).config;
    expect(saved.columnDefinitions.map((c) => c.field).sort()).toEqual(['id', 'price', 'symbol']);
  });

  it('fields sets an exact list resolved against the live probe', async () => {
    mockProbeAndInferFields.mockResolvedValue({ ok: true, fields: INFERRED, rowsFetched: 40, rowsUsed: 40 });
    const { store: s, save } = store(stompProvider());

    await setProviderColumns(configManager(), s, { providerId: 'p9', fields: ['symbol', 'price'] });

    const saved = (save.mock.calls[0][0] as { config: { columnDefinitions: Array<{ field: string; hide?: boolean }> } }).config;
    expect(saved.columnDefinitions.filter((c) => !c.hide).map((c) => c.field)).toEqual(['symbol', 'price']);
  });

  it('rejects a field name the probe never saw', async () => {
    mockProbeAndInferFields.mockResolvedValue({ ok: true, fields: INFERRED, rowsFetched: 40, rowsUsed: 40 });
    const { store: s, save } = store(stompProvider());

    const result = await setProviderColumns(configManager(), s, { providerId: 'p9', fields: ['price', 'nope'] });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('nope');
    expect(save).not.toHaveBeenCalled();
  });

  it('add merges probed fields into the existing set', async () => {
    mockProbeAndInferFields.mockResolvedValue({ ok: true, fields: INFERRED, rowsFetched: 40, rowsUsed: 40 });
    const { store: s, save } = store(stompProvider({ columnDefinitions: [{ field: 'id' }] }));

    await setProviderColumns(configManager(), s, { providerId: 'p9', add: ['price'] });

    const saved = (save.mock.calls[0][0] as { config: { columnDefinitions: Array<{ field: string; hide?: boolean }> } }).config;
    expect(saved.columnDefinitions.filter((c) => !c.hide).map((c) => c.field)).toEqual(['id', 'price']);
  });

  it('remove alone needs no probe at all', async () => {
    const { store: s, save } = store(
      stompProvider({ columnDefinitions: [{ field: 'id' }, { field: 'price' }, { field: 'symbol' }] }),
    );

    const result = await setProviderColumns(configManager(), s, { providerId: 'p9', remove: ['symbol'] });

    expect(result.ok).toBe(true);
    expect(mockProbeAndInferFields).not.toHaveBeenCalled();
    const saved = (save.mock.calls[0][0] as { config: { columnDefinitions: Array<{ field: string; hide?: boolean }> } }).config;
    expect(saved.columnDefinitions.filter((c) => !c.hide).map((c) => c.field)).toEqual(['id', 'price']);
  });

  it('re-adds the key column hidden via the live probe when fields excludes it', async () => {
    mockProbeAndInferFields.mockResolvedValue({ ok: true, fields: INFERRED, rowsFetched: 40, rowsUsed: 40 });
    const { store: s, save } = store(stompProvider());

    await setProviderColumns(configManager(), s, { providerId: 'p9', fields: ['symbol', 'price'] });

    const saved = (save.mock.calls[0][0] as { config: { columnDefinitions: Array<{ field: string; hide?: boolean }> } }).config;
    const key = saved.columnDefinitions.find((c) => c.field === 'id');
    expect(key?.hide).toBe(true);
  });

  it('re-adds the key column hidden via a bare fallback when it is removed without any probe happening', async () => {
    const { store: s, save } = store(
      stompProvider({ columnDefinitions: [{ field: 'id' }, { field: 'price' }] }),
    );

    const result = await setProviderColumns(configManager(), s, { providerId: 'p9', remove: ['id'] });

    expect(result.ok).toBe(true);
    expect(mockProbeAndInferFields).not.toHaveBeenCalled();
    const saved = (save.mock.calls[0][0] as { config: { columnDefinitions: Array<{ field: string; hide?: boolean }> } }).config;
    const key = saved.columnDefinitions.find((c) => c.field === 'id');
    expect(key?.hide).toBe(true);
  });

  it('surfaces a probe failure rather than saving nothing silently', async () => {
    mockProbeAndInferFields.mockResolvedValue({ ok: false, error: 'timed out' });
    const { store: s, save } = store(stompProvider());

    const result = await setProviderColumns(configManager(), s, { providerId: 'p9', preset: 'curated' });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('timed out');
    expect(save).not.toHaveBeenCalled();
  });
});
