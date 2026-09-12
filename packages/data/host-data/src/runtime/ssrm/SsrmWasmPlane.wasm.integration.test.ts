/**
 * SsrmWasmPlane against the REAL vendored engine.
 *
 * The engine is a black box — its behaviours here (the `sort` key, the `|`
 * pivot separator, whole-row upserts, splitBy-needs-groupBy) were learned by
 * probing, not from documentation, so this suite pins them: a vendored WASM
 * bump that changes any of them fails here instead of rendering silently
 * wrong grids. Everything else in the plane's suite runs against fakes; keep
 * this one small and fast.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { StompSsrmProviderConfig } from '@wellsfargo-starui/types';
import { SsrmWasmPlane } from './SsrmWasmPlane.js';
import type { RustHubLike } from './RustHubHost.js';

// `import.meta.url` is a vite-transformed non-file URL under vitest, so the
// vendor dir is found from the run cwd (packages/data under turbo and when
// run directly) instead.
const VENDOR_DIR = ['host-data/vendor/dshub', 'vendor/dshub', 'packages/data/host-data/vendor/dshub']
  .map((p) => resolve(process.cwd(), p))
  .find((p) => existsSync(p))!;

async function realHub(): Promise<RustHubLike> {
  const mod = await import(pathToFileURL(`${VENDOR_DIR}/dshub.js`).href) as {
    initSync: (opts: { module: Buffer }) => void;
    RustHub: { new(): RustHubLike };
  };
  mod.initSync({ module: readFileSync(`${VENDOR_DIR}/dshub_bg.wasm`) });
  return mod.RustHub.new();
}

const cfg = {
  providerType: 'stomp-ssrm',
  websocketUrl: 'ws://x',
  listenerTopic: '/t',
  snapshotEndToken: 'Success',
  requestBody: '',
  keyColumn: 'id',
  columnDefinitions: [
    { field: 'id' },
    { field: 'desk' },
    { field: 'region' },
    { field: 'trader' },
    { field: 'mv', cellDataType: 'number' },
  ],
} as StompSsrmProviderConfig;

const ROWS = [
  { id: 'r1', desk: 'Rates', region: 'US', trader: 'ann', mv: 10 },
  { id: 'r2', desk: 'Rates', region: 'EU', trader: 'bob', mv: 20 },
  { id: 'r3', desk: 'Credit', region: 'US', trader: 'cat', mv: 30 },
  { id: 'r4', desk: 'Credit', region: 'EU', trader: 'dan', mv: 40 },
];

describe('SsrmWasmPlane × vendored engine', () => {
  let plane: SsrmWasmPlane;

  beforeAll(async () => {
    plane = new SsrmWasmPlane(realHub);
    await plane.boot('p1', cfg);
    await plane.attachSession('s1');
    await plane.ingest('p1', ROWS, false);
  });

  it('honours a descending sort (the `sort`-not-`dir` contract)', async () => {
    const page = await plane.getRows('s1', 'p1', {
      startRow: 0,
      endRow: 10,
      sortModel: [{ colId: 'mv', sort: 'desc' }],
    });
    expect(page.rowData.map((r) => r.id)).toEqual(['r4', 'r3', 'r2', 'r1']);
  });

  it('pivots a grouped view and derives the `|`-separated result fields', async () => {
    const page = await plane.getRows('s1', 'p1', {
      startRow: 0,
      endRow: 10,
      pivotMode: true,
      rowGroupCols: [{ id: 'desk' }],
      pivotCols: [{ id: 'region' }],
      valueCols: [{ id: 'mv', aggFunc: 'sum' }],
    });
    expect(page.rowCount).toBe(2);
    expect(page.pivotResultFields).toEqual(['EU|mv', 'US|mv']);
    const byDesk = new Map(page.rowData.map((r) => [r.desk, r]));
    expect(byDesk.get('Credit')).toMatchObject({ 'EU|mv': 40, 'US|mv': 30, __count: 2 });
    expect(byDesk.get('Rates')).toMatchObject({ 'EU|mv': 20, 'US|mv': 10, __count: 2 });
  });

  it('holds an engine-side edit over a whole-row upstream resend', async () => {
    await plane.applyEdits('p1', [{ ...ROWS[0], trader: 'EDITED' }], [['trader']]);
    // The legacy wire resends the whole pre-edit row.
    await plane.ingest('p1', [ROWS[0]], false);
    const page = await plane.getRows('s1', 'p1', { startRow: 0, endRow: 10 });
    const r1 = page.rowData.find((r) => r.id === 'r1');
    // Whole-row upsert semantics are real here: without the overlay the
    // resend would have reverted `trader` to 'ann'.
    expect(r1).toMatchObject({ trader: 'EDITED', mv: 10 });

    // Upstream genuinely moves the column — it wins again.
    await plane.ingest('p1', [{ ...ROWS[0], trader: 'eve' }], false);
    const after = await plane.getRows('s1', 'p1', { startRow: 0, endRow: 10 });
    expect(after.rowData.find((r) => r.id === 'r1')).toMatchObject({ trader: 'eve' });
  });
});
