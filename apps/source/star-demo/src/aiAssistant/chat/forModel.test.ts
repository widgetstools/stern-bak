import { describe, expect, it } from 'vitest';
import { forModel } from './useChatSession';
import { DATA_CELL } from '../dataTools';
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
