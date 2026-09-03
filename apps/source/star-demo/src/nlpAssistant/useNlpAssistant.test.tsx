import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNlpAssistant } from './useNlpAssistant';

vi.mock('../aiAssistant/gridProfiles', () => ({
  resolveGridEntry: vi.fn(async (id: string) => (id === 'grid-test' ? { id, displayName: 'Test Blotter', configId: 'cfg' } : undefined)),
}));
vi.mock('../aiAssistant/columnResolver', () => ({
  readColumnCatalogue: vi.fn(async () => [
    { colId: 'issuerSector', headerName: 'Sector', cellDataType: 'text' },
    { colId: 'notional', headerName: 'Notional', cellDataType: 'number' },
    { colId: 'cusip', headerName: 'CUSIP', cellDataType: 'text' },
  ]),
  isNumericColumn: (c: { cellDataType?: string }) => c.cellDataType === 'number',
}));
vi.mock('./nlpClient', () => ({
  serverHealthy: vi.fn(async () => true),
  parseOnServer: vi.fn(async () => ({
    intent: 'sort_data',
    confidence: 0.92,
    entities: { columns: ['notional'], unresolved: [], aggregations: {}, sortDirection: 'desc', filters: [] },
    model: 'test/model',
    latencyMs: 12,
  })),
  DEFAULT_NLP_URL: 'http://x',
}));

const deps = () => ({
  configManager: {} as never,
  configStore: {} as never,
  targetGridId: 'grid-test',
  executeTool: vi.fn(async (name: string) => ({ ok: true, summary: `ran ${name}` })),
});

describe('useNlpAssistant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes a confident local parse straight to the tool and echoes its summary', async () => {
    const d = deps();
    const { result } = renderHook(() => useNlpAssistant(d));
    await waitFor(() => expect(result.current.catalogue.length).toBe(3));
    await act(() => result.current.send('group by sector and sum notional'));
    expect(d.executeTool).toHaveBeenCalledWith('set_row_grouping', expect.objectContaining({ targetGridId: 'grid-test', groupBy: ['issuerSector'], aggregations: { notional: 'sum' } }));
    const last = result.current.items.at(-1);
    expect(last).toMatchObject({ kind: 'assistant', text: 'ran set_row_grouping', debug: { intent: 'group_grid', source: 'local', tool: 'set_row_grouping' } });
  });

  it('asks for clarification instead of guessing when no column resolves', async () => {
    const d = deps();
    const { result } = renderHook(() => useNlpAssistant(d));
    await waitFor(() => expect(result.current.catalogue.length).toBe(3));
    await act(() => result.current.send('sort by banana'));
    expect(d.executeTool).not.toHaveBeenCalled();
    expect(result.current.items.at(-1)).toMatchObject({ kind: 'assistant', text: expect.stringMatching(/which column/i) });
  });

  it('falls through to the server when local is unsure and a server is configured', async () => {
    const d = { ...deps(), serverUrl: 'http://x' };
    const { result } = renderHook(() => useNlpAssistant(d));
    await waitFor(() => expect(result.current.serverOk).toBe(true));
    await waitFor(() => expect(result.current.catalogue.length).toBe(3));
    await act(() => result.current.send('biggest notional at the top please'));
    expect(d.executeTool).toHaveBeenCalledWith('set_sort', expect.objectContaining({ sortBy: [{ column: 'notional', direction: 'desc' }] }));
    expect(result.current.items.at(-1)).toMatchObject({ debug: { source: 'server', model: 'test/model' } });
  });

  it('refuses to act with no target grid', async () => {
    const d = { ...deps(), targetGridId: undefined };
    const { result } = renderHook(() => useNlpAssistant(d));
    await act(() => result.current.send('hide cusip'));
    expect(d.executeTool).not.toHaveBeenCalled();
    expect(result.current.items.at(-1)).toMatchObject({ text: expect.stringMatching(/pick a blotter/i) });
  });
});
