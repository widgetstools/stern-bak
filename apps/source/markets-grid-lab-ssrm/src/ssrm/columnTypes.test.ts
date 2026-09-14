import { describe, expect, it } from 'vitest';
import { baseColumns } from '../../../markets-grid-lab/src/data/columns';
import {
  LAB_DATE_FIELDS,
  LAB_NUMBER_FIELDS,
  LAB_TEXT_FIELDS,
  labSsrmColumnDefinitions,
} from './columnTypes';

describe('labSsrmColumnDefinitions', () => {
  const declared = new Set<string>([...LAB_TEXT_FIELDS, ...LAB_NUMBER_FIELDS, ...LAB_DATE_FIELDS]);

  it('covers every lab column backed by a field — drift fails here, not as a blank column', () => {
    const missing = baseColumns
      .filter((c) => typeof c.field === 'string')
      .map((c) => c.field as string)
      .filter((f) => !declared.has(f));
    expect(missing).toEqual([]);
  });

  it('carries the KRD sparkline inputs even though they are not columns', () => {
    for (const f of ['krd1Y', 'krd2Y', 'krd5Y', 'krd10Y', 'krd30Y']) {
      expect(declared.has(f)).toBe(true);
    }
  });

  it('declares no field twice and types every entry', () => {
    const defs = labSsrmColumnDefinitions();
    expect(new Set(defs.map((d) => d.field)).size).toBe(defs.length);
    for (const def of defs) {
      expect(['text', 'number', 'dateString']).toContain(def.cellDataType);
    }
  });

  it('keys rows by id (the mock generator dataset id field)', () => {
    expect(LAB_TEXT_FIELDS).toContain('id');
  });
});
