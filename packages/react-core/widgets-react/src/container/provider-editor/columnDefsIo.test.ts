import { describe, it, expect } from 'vitest';
import type { ColumnDefinition } from '@wellsfargo-starui/shared-types';
import { serializeColumnDefs, parseColumnDefsImport } from './columnDefsIo';

const sample: ColumnDefinition[] = [
  { field: 'positionId', headerName: 'Position Id', cellDataType: 'text' },
  {
    field: 'inventoryName',
    headerName: 'Inventory',
    cellDataType: 'text',
    valueGetter: 'STARTS_WITH([cusip], "SPCL") ? [alt] : [inventoryName]',
  },
];

describe('serializeColumnDefs', () => {
  it('serializes to a JSON array preserving valueGetter', () => {
    const json = serializeColumnDefs(sample);
    const parsed = JSON.parse(json) as ColumnDefinition[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[1].valueGetter).toBe(sample[1].valueGetter);
  });

  it('does not mutate or reference the source array', () => {
    const json = serializeColumnDefs(sample);
    const parsed = JSON.parse(json) as ColumnDefinition[];
    expect(parsed).not.toBe(sample);
    expect(parsed).toEqual(sample);
  });
});

describe('parseColumnDefsImport', () => {
  it('round-trips a serialized array, valueGetter intact', () => {
    const cols = parseColumnDefsImport(serializeColumnDefs(sample));
    expect(cols).toEqual(sample);
  });

  it('accepts a bare array', () => {
    const cols = parseColumnDefsImport(JSON.stringify([{ field: 'a', headerName: 'A' }]));
    expect(cols).toEqual([{ field: 'a', headerName: 'A' }]);
  });

  it('accepts a { columns } wrapper and the export envelope', () => {
    const wrapped = parseColumnDefsImport(JSON.stringify({ columns: [{ field: 'a' }] }));
    expect(wrapped[0].field).toBe('a');
    const envelope = parseColumnDefsImport(
      JSON.stringify({ kind: 'starui.columnDefs', version: 1, columns: [{ field: 'b' }] }),
    );
    expect(envelope[0].field).toBe('b');
  });

  it('defaults headerName to field when missing', () => {
    const cols = parseColumnDefsImport(JSON.stringify([{ field: 'cusip' }]));
    expect(cols[0]).toEqual({ field: 'cusip', headerName: 'cusip' });
  });

  it('drops unknown keys and invalid cellDataType but keeps valueGetter', () => {
    const cols = parseColumnDefsImport(
      JSON.stringify([
        { field: 'x', headerName: 'X', cellDataType: 'bogus', evil: 1, valueGetter: '[y] + 1' },
      ]),
    );
    expect(cols[0]).toEqual({ field: 'x', headerName: 'X', valueGetter: '[y] + 1' });
    expect('evil' in cols[0]).toBe(false);
    expect('cellDataType' in cols[0]).toBe(false);
  });

  it('skips entries without a usable field', () => {
    const cols = parseColumnDefsImport(
      JSON.stringify([{ headerName: 'no field' }, { field: '   ' }, { field: 'ok' }]),
    );
    expect(cols).toEqual([{ field: 'ok', headerName: 'ok' }]);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseColumnDefsImport('{ not json')).toThrow(/valid JSON/i);
  });

  it('throws when there is no columns array', () => {
    expect(() => parseColumnDefsImport(JSON.stringify({ foo: 'bar' }))).toThrow(/column-definitions array/i);
  });

  it('throws when no entry has a field', () => {
    expect(() => parseColumnDefsImport(JSON.stringify([{ headerName: 'x' }]))).toThrow(/needs a "field"/i);
  });
});
