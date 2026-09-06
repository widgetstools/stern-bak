import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore, ReportSpec } from '@wellsfargo-starui/data';

const ENTRY = {
  id: 'grid-pos', configId: 'grid-pos', componentType: 'grid', componentSubType: 'pos',
  displayName: 'Positions', hostUrl: '', iconId: '', createdAt: '', type: 'internal' as const,
  usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '', singleton: true, asWindow: true,
};

let liveRows: Array<Record<string, unknown>> = [];
let fetchOk = true;
vi.mock('./dataAccess', () => ({
  fetchGridRows: async () =>
    fetchOk
      ? { ok: true, value: { rows: liveRows, source: 'live', providerId: 'p', providerName: 'F', provenance: 'live' } }
      : { ok: false, error: 'no data provider bound' },
}));

const CATALOGUE = [
  { colId: 'desk', headerName: 'Desk' },
  { colId: 'sector', headerName: 'Sector' },
  { colId: 'marketValue', headerName: 'Market Value', cellDataType: 'number' },
];
vi.mock('./columnResolver', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readColumnCatalogue: async () => CATALOGUE,
}));

import { preflightReport, describeBroken } from './reportPreflight';

const deps = { configManager: {} as ConfigManager, configStore: {} as DataProviderConfigStore };
const spec = (...blocks: unknown[]) => ({ title: 'R', blocks }) as unknown as ReportSpec;

async function run(...blocks: unknown[]) {
  const out = await preflightReport(deps, ENTRY, spec(...blocks));
  if (!out.ok) throw new Error(out.error);
  return out.value;
}

beforeEach(() => {
  fetchOk = true;
  liveRows = [
    { desk: 'Rates', sector: 'Govt', marketValue: 100 },
    { desk: 'Credit', sector: 'Fin', marketValue: 200 },
    { desk: 'HY', sector: 'Energy', marketValue: 50 },
  ];
});

describe('a block that can never draw is BROKEN', () => {
  /** The commonest composition mistake, and the one with the clearest fix. */
  it('names a column that does not exist on the blotter', async () => {
    const { broken } = await run({
      kind: 'table', title: 'Bad', query: { groupBy: ['notAColumn'], aggregate: [{ column: 'marketValue', fn: 'sum' }] },
    });
    expect(broken).toHaveLength(1);
    expect(broken[0].reason).toContain('"notAColumn"');
    expect(broken[0].reason).toMatch(/not a column/);
  });

  it('reports a chart with no numeric to plot, and says what it does have', async () => {
    const { broken } = await run({ kind: 'chart', title: 'C', query: { columns: ['desk', 'sector'] } });
    expect(broken).toHaveLength(1);
    expect(broken[0].reason).toMatch(/No numeric column to plot/);
  });

  it('reports a chart of a single row as nothing to compare', async () => {
    liveRows = [{ desk: 'Rates', sector: 'Govt', marketValue: 100 }];
    const { broken } = await run({ kind: 'chart', title: 'C', query: { columns: ['desk', 'marketValue'] } });
    expect(broken[0].reason).toMatch(/nothing to compare/);
  });

  /**
   * A KPI whose column is absent from the result renders an em-dash, which
   * reads as "a number that happens to be unavailable" rather than a tile
   * pointing at nothing.
   */
  it('reports KPI tiles that find no value, and names the columns that exist', async () => {
    const { broken } = await run({
      kind: 'kpis', title: 'Headline',
      query: { groupBy: ['desk'], aggregate: [{ column: 'marketValue', fn: 'sum' }] },
      tiles: [{ label: 'Avg YTM', column: 'yieldToMaturity' }],
    });
    expect(broken).toHaveLength(1);
    expect(broken[0].reason).toMatch(/Avg YTM|no tile finds/);
  });

  it('addresses each bad block by index so it can be fixed in place', async () => {
    const { broken } = await run(
      { kind: 'commentary', text: 'fine' },
      { kind: 'chart', title: 'C', query: { columns: ['desk', 'sector'] } },
    );
    expect(broken[0].index).toBe(1);
    expect(describeBroken(broken)).toContain('block 1');
    expect(describeBroken(broken)).toContain('"C"');
  });
});

describe('a valid query that matches nothing is EMPTY, not broken', () => {
  it('separates the two', async () => {
    const { broken, empty } = await run({
      kind: 'table', title: 'None', query: { filter: [{ column: 'desk', op: 'eq', value: 'Nope' }] },
    });
    expect(broken).toHaveLength(0);
    expect(empty).toHaveLength(1);
    expect(empty[0].reason).toMatch(/matched no rows/);
  });
});

describe('a block that draws is OK', () => {
  it('passes a chart with a category and a measure', async () => {
    const { broken, empty, verdicts } = await run({
      kind: 'chart', title: 'By desk',
      query: { groupBy: ['desk'], aggregate: [{ column: 'marketValue', fn: 'sum' }] },
    });
    expect(broken).toHaveLength(0);
    expect(empty).toHaveLength(0);
    expect(verdicts[0].status).toBe('ok');
  });

  it('passes KPI tiles that find their aggregated value', async () => {
    const { broken } = await run({
      kind: 'kpis', title: 'H',
      query: { groupBy: ['desk'], aggregate: [{ column: 'marketValue', fn: 'sum' }] },
      tiles: [{ label: 'MV', column: 'marketValue', fn: 'sum' }],
    });
    expect(broken).toHaveLength(0);
  });

  /** Commentary is authored prose — it runs no query and cannot be broken. */
  it('never faults commentary', async () => {
    const { verdicts } = await run({ kind: 'commentary', text: 'Anything at all' });
    expect(verdicts[0].status).toBe('ok');
  });
});

describe('when the preflight itself cannot run', () => {
  /** No provider bound is the window's own "no data yet" case — refusing here
   *  would be worse than showing the report. */
  it('reports failure rather than faulting every block', async () => {
    fetchOk = false;
    const out = await preflightReport(deps, ENTRY, spec({ kind: 'commentary', text: 'x' }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/no data provider bound/);
  });
});
