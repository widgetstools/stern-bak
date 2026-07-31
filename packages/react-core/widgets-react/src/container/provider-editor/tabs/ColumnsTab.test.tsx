import { describe, expect, it } from 'vitest';
import type { ColumnDefinition } from '@wellsfargo-starui/shared-types';
import { removeColumnDefinition } from './ColumnsTab.js';

const START: ColumnDefinition[] = [
  { field: 'positionId', headerName: 'Position ID' },
  { field: 'cusip', headerName: 'CUSIP' },
  { field: 'instrumentType', headerName: 'Type' },
];

describe('removeColumnDefinition', () => {
  it('drops the matching field and keeps the rest', () => {
    expect(removeColumnDefinition(START, 'cusip')).toEqual([
      { field: 'positionId', headerName: 'Position ID' },
      { field: 'instrumentType', headerName: 'Type' },
    ]);
  });

  it('is a no-op when the field is absent', () => {
    expect(removeColumnDefinition(START, 'missing')).toEqual(START);
  });
});
