/**
 * Soak test — valueGetter expression hot path under sustained load.
 *
 * Simulates high-frequency STOMP-style row updates: thousands of getter
 * evaluations per second across many expression columns, with periodic
 * compile-cache churn. Fails if heap grows beyond a threshold after warmup.
 *
 * Run:
 *   npm run soak:value-getter
 *   npm run soak:value-getter -w @wellsfargo-starui/widgets-react
 *
 * Skipped by default (`npm test`) unless SOAK=1.
 *
 * Optional env (defaults tuned for ~30s local run):
 *   SOAK_DURATION_SEC=60
 *   SOAK_WARMUP_SEC=10
 *   SOAK_TARGET_EVALS_PER_SEC=50000
 *   SOAK_VISIBLE_ROWS=40
 *   SOAK_EXPR_COLUMNS=20
 *   SOAK_HEAP_MAX_DELTA_MB=48
 */

import type { ColDef, ValueGetterParams } from 'ag-grid-community';
import { describe, expect, it } from 'vitest';
import {
  buildColumnDefs,
  __getCompileCacheSizeForTests,
  __resetColumnDefExpressionCache,
} from './buildColumnDefs.js';

const ENABLED = process.env.SOAK === '1';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function mb(bytes: number): number {
  return bytes / (1024 * 1024);
}

function forceGc(): void {
  const g = globalThis as { gc?: () => void };
  g.gc?.();
}

function heapUsed(): number {
  return process.memoryUsage().heapUsed;
}

type GetterFn = (params: ValueGetterParams) => unknown;

function buildFixture(exprColumnCount: number): {
  getters: GetterFn[];
  columnDefs: ColDef[];
} {
  const columnDefinitions: ColDef[] = [];

  for (let i = 0; i < exprColumnCount; i++) {
    columnDefinitions.push({
      field: `base_${i}`,
      headerName: `Expr ${i}`,
      valueGetter:
        `STARTS_WITH([ticker], "T") AND [price] > ${i * 10}` +
        ` ? CONCAT([region], "/", [country])` +
        ` : [pnl.wrapper.value_${i % 5}]`,
    });
  }

  for (let i = 0; i < 30; i++) {
    columnDefinitions.push({ field: `flat_${i}`, headerName: `Flat ${i}` });
  }

  const columnDefs = buildColumnDefs(columnDefinitions)!;
  const getters = columnDefs
    .map((d) => d.valueGetter)
    .filter((vg): vg is GetterFn => typeof vg === 'function');

  return { getters, columnDefs };
}

function makeRowPool(count: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      ticker: i % 3 === 0 ? `T${i}` : `X${i}`,
      price: 50 + (i % 200),
      region: `R${i % 7}`,
      country: `C${i % 11}`,
      pnl: {
        wrapper: {
          value_0: i,
          value_1: i * 2,
          value_2: i * 3,
          value_3: i * 4,
          value_4: i * 5,
        },
      },
    });
  }
  return rows;
}

function runEvaluationBatch(
  getters: GetterFn[],
  rows: Record<string, unknown>[],
  visibleRows: number,
): number {
  let evals = 0;
  const limit = Math.min(visibleRows, rows.length);
  for (let r = 0; r < limit; r++) {
    const data = rows[r]!;
    data.price = (data.price as number) + 0.01;
    const params = { data } as ValueGetterParams;
    for (let g = 0; g < getters.length; g++) {
      getters[g](params);
      evals++;
    }
  }
  return evals;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSoak(): Promise<void> {
  const durationSec = envInt('SOAK_DURATION_SEC', 30);
  const warmupSec = envInt('SOAK_WARMUP_SEC', 5);
  const targetEvalsPerSec = envInt('SOAK_TARGET_EVALS_PER_SEC', 50_000);
  const visibleRows = envInt('SOAK_VISIBLE_ROWS', 40);
  const exprColumns = envInt('SOAK_EXPR_COLUMNS', 20);
  const maxHeapDeltaMb = envFloat('SOAK_HEAP_MAX_DELTA_MB', 48);

  __resetColumnDefExpressionCache();

  const { getters } = buildFixture(exprColumns);
  const rowPool = makeRowPool(500);

  const evalsPerBatch = getters.length * Math.min(visibleRows, rowPool.length);
  const batchesPerSec = Math.max(1, Math.ceil(targetEvalsPerSec / evalsPerBatch));
  const batchIntervalMs = 1000 / batchesPerSec;

  const log = (line: string) => process.stderr.write(`${line}\n`);
  log('[soak:value-getter] configuration');
  log(`  duration:        ${durationSec}s (warmup ${warmupSec}s)`);
  log(`  expr columns:    ${exprColumns} (${getters.length} function getters)`);
  log(`  visible rows:    ${visibleRows}`);
  log(`  target evals/s:  ${targetEvalsPerSec.toLocaleString()}`);
  log(`  batch interval:  ${batchIntervalMs.toFixed(2)}ms (${evalsPerBatch} evals/batch)`);
  log(`  heap delta cap:  ${maxHeapDeltaMb} MB after warmup`);

  const warmupEnd = Date.now() + warmupSec * 1000;
  let warmupEvals = 0;
  while (Date.now() < warmupEnd) {
    warmupEvals += runEvaluationBatch(getters, rowPool, visibleRows);
    if (warmupEvals % 200_000 < evalsPerBatch) {
      const i = warmupEvals % 1200;
      buildColumnDefs([{ field: 'x', valueGetter: `[churn_${i}] + [price]` }] as ColDef[]);
    }
  }

  forceGc();
  await sleep(50);
  const baselineHeap = heapUsed();

  const mainEnd = Date.now() + durationSec * 1000;
  let totalEvals = 0;
  let churnCount = 0;
  const heapSamples: number[] = [baselineHeap];
  let lastSample = Date.now();

  while (Date.now() < mainEnd) {
    const batchStart = performance.now();
    totalEvals += runEvaluationBatch(getters, rowPool, visibleRows);

    if (totalEvals % 100_000 < evalsPerBatch) {
      const i = totalEvals % 1500;
      buildColumnDefs([
        { field: 'a', valueGetter: `IF([price] > ${i}, [region], [country])` },
        { field: 'b', valueGetter: `[pnl.wrapper.value_${i % 5}]` },
      ] as ColDef[]);
      churnCount++;
    }

    const elapsed = performance.now() - batchStart;
    const wait = Math.max(0, batchIntervalMs - elapsed);
    if (wait > 0) await sleep(wait);

    if (Date.now() - lastSample >= 5000) {
      forceGc();
      heapSamples.push(heapUsed());
      lastSample = Date.now();
    }
  }

  forceGc();
  await sleep(100);
  const finalHeap = heapUsed();
  const heapDeltaMb = mb(finalHeap - baselineHeap);
  const evalsPerSec = Math.round(totalEvals / durationSec);

  log('[soak:value-getter] results');
  log(`  warmup evals:    ${warmupEvals.toLocaleString()}`);
  log(`  main evals:      ${totalEvals.toLocaleString()} (${evalsPerSec.toLocaleString()}/s)`);
  log(`  compile churn:   ${churnCount} provider rebuilds`);
  log(`  compile cache:   ${__getCompileCacheSizeForTests()} entries (max 1000)`);
  log(`  baseline heap:   ${mb(baselineHeap).toFixed(2)} MB`);
  log(`  final heap:      ${mb(finalHeap).toFixed(2)} MB`);
  log(`  heap delta:      ${heapDeltaMb.toFixed(2)} MB`);
  if (heapSamples.length > 1) {
    const sampleDeltas = heapSamples.slice(1).map((h) => mb(h - baselineHeap));
    log(`  5s samples Δ:    ${sampleDeltas.map((d) => `${d.toFixed(1)}MB`).join(', ')}`);
  }

  if (heapDeltaMb > maxHeapDeltaMb) {
    throw new Error(
      `Heap grew ${heapDeltaMb.toFixed(2)} MB (limit ${maxHeapDeltaMb} MB) — possible leak in valueGetter path`,
    );
  }

  if (__getCompileCacheSizeForTests() > 1000) {
    throw new Error('Compile cache exceeded bound (1000)');
  }

  log('[soak:value-getter] PASS — heap stable under sustained load');
}

describe.runIf(ENABLED)('valueGetter soak', () => {
  it('heap stays bounded under thousands of evals/sec', { timeout: 600_000 }, async () => {
    await runSoak();
    expect(true).toBe(true);
  });
});
