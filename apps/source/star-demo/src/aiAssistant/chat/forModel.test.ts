import { describe, expect, it } from 'vitest';
import { forModel } from './useChatSession';
import { DATA_CELL } from '../dataTools';
import { SCENARIO_CELL } from '../scenarioTools';
import type { ToolExecutionResult } from '../useToolExecutor';

function dataCell(rowCount: number): ToolExecutionResult {
  return {
    ok: true,
    summary: `${rowCount} rows`,
    data: {
      kind: DATA_CELL,
      gridName: 'rates-blotter',
      source: 'live',
      provenance: 'Live data',
      rowCount,
      ran: 'net exposure by desk',
      table: {
        columns: ['desk', 'exposure'],
        rows: Array.from({ length: rowCount }, (_, i) => ({ desk: `d${i}`, exposure: i })),
        grouped: true,
        matched: rowCount,
        scanned: rowCount,
        truncated: false,
      },
    },
  };
}

/**
 * A tool result stays in the wire history for the rest of the conversation, so
 * an oversized one is re-billed on EVERY later turn — not just the turn that
 * produced it. The panel renders every row regardless; only the model's copy
 * is capped.
 */
describe('forModel', () => {
  it('leaves an ordinary result completely untouched, without copying it', () => {
    const result = dataCell(50);
    expect(forModel(result)).toBe(result);
  });

  it('passes through a result with no data payload at all', () => {
    const plain: ToolExecutionResult = { ok: true, summary: 'Hid ISIN' };
    expect(forModel(plain)).toBe(plain);
  });

  it('passes through a non-data-cell payload untouched', () => {
    const fieldCell: ToolExecutionResult = {
      ok: true,
      summary: 'fields',
      data: { kind: 'field-cell', groups: Array.from({ length: 300 }, (_, i) => ({ group: `g${i}` })) },
    };
    expect(forModel(fieldCell)).toBe(fieldCell);
  });

  it('caps an oversized row set and says how many it withheld', () => {
    const trimmed = forModel(dataCell(500));
    const table = (trimmed.data as { table: { rows: unknown[]; rowsWithheldFromModel: number; note: string } }).table;

    expect(table.rows).toHaveLength(50);
    expect(table.rowsWithheldFromModel).toBe(450);
    expect(table.note).toContain('450 withheld');
    // The model must know the user can still see them, so it doesn't
    // re-query just to narrate what is already on screen.
    expect(table.note).toContain('panel');
  });

  it('keeps the first rows, so a sorted "top N" result stays answerable', () => {
    const trimmed = forModel(dataCell(200));
    const rows = (trimmed.data as { table: { rows: Array<{ desk: string }> } }).table.rows;
    expect(rows[0].desk).toBe('d0');
    expect(rows.at(-1)!.desk).toBe('d49');
  });

  it('does not mutate the original result', () => {
    const original = dataCell(500);
    forModel(original);
    expect((original.data as { table: { rows: unknown[] } }).table.rows).toHaveLength(500);
  });

  it('preserves the summary and the rest of the payload', () => {
    const trimmed = forModel(dataCell(500));
    const data = trimmed.data as { gridName: string; provenance: string; rowCount: number };
    expect(trimmed.summary).toBe('500 rows');
    expect(data.gridName).toBe('rates-blotter');
    expect(data.provenance).toBe('Live data');
    expect(data.rowCount).toBe(500);
  });
});

describe('scenario results', () => {
  /**
   * A scan carries one number per world — up to a thousand — and a tool result
   * stays in the message list for the rest of the conversation, so leaving the
   * distribution in would re-bill it on every later turn.
   */
  const scenario = (worlds: number): ToolExecutionResult => ({
    ok: true,
    summary: 'scanned',
    data: {
      kind: SCENARIO_CELL,
      view: 'scan',
      bookFingerprint: 'bk-abc',
      positionCount: 1758,
      baseMarketValue: 2.28e10,
      headline: 'h',
      plausibility: 'p',
      scan: {
        bookFingerprint: 'bk-abc', positionCount: 1758, baseMarketValue: 2.28e10,
        worlds, horizonDays: 20,
        terminalPnl: Array.from({ length: worlds }, (_, i) => -i * 1000),
        mean: -1, median: -2, var95: -3, cvar95: -4, best: 5, worst: -6,
        worstWorlds: [], plausibility: 'p', elapsedMs: 12, revaluation: 'fast-path',
        distribution: [{ from: -1, to: 0, count: worlds }],
      },
    },
  });

  it('drops the per-world outcomes and the histogram', () => {
    const trimmed = forModel(scenario(500));
    const scan = (trimmed.data as { scan: Record<string, unknown> }).scan;
    expect(scan.terminalPnl).toBeUndefined();
    expect(scan.distribution).toBeUndefined();
  });

  it('keeps every statistic the model needs to describe the result', () => {
    const scan = (forModel(scenario(500)).data as { scan: Record<string, unknown> }).scan;
    expect(scan.median).toBe(-2);
    expect(scan.var95).toBe(-3);
    expect(scan.cvar95).toBe(-4);
    expect(scan.worst).toBe(-6);
    expect(scan.worlds).toBe(500);
    expect(scan.horizonDays).toBe(20);
  });

  it('says what was withheld, so the model re-runs rather than guessing', () => {
    const scan = (forModel(scenario(250)).data as { scan: Record<string, unknown> }).scan;
    expect(scan.worldsSummarised).toBe(250);
    expect(String(scan.note)).toContain('250 individual world outcomes');
    expect(String(scan.note)).toContain('withheld');
  });

  it('leaves the payload untouched for the views that carry no distribution', () => {
    const worstMove: ToolExecutionResult = {
      ok: true, summary: 's',
      data: { kind: SCENARIO_CELL, view: 'worst-move', bookFingerprint: 'bk', positionCount: 0, baseMarketValue: 0, headline: 'h', plausibility: 'p' },
    };
    expect(forModel(worstMove)).toBe(worstMove);
  });

  it('keeps the summary, which is what the model actually reads back', () => {
    expect(forModel(scenario(500)).summary).toBe('scanned');
    expect(forModel(scenario(500)).ok).toBe(true);
  });
});
