import { describe, expect, it } from 'vitest';
import { flattenHubInspectorRows } from './HubInspectorVirtualSection.js';

describe('flattenHubInspectorRows', () => {
  const rows = [
    { id: 'a', expandable: true },
    { id: 'b', expandable: false },
    { id: 'c', expandable: true },
  ];

  it('emits one main item per row when nothing is expanded', () => {
    const items = flattenHubInspectorRows(
      rows,
      null,
      (row) => row.id,
      (row) => row.expandable,
    );
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.kind === 'main')).toBe(true);
  });

  it('inserts a detail item after the expanded row', () => {
    const items = flattenHubInspectorRows(
      rows,
      'c',
      (row) => row.id,
      (row) => row.expandable,
    );
    expect(items.map((item) => item.id)).toEqual([
      'main:a',
      'main:b',
      'main:c',
      'detail:c',
    ]);
  });

  it('does not insert detail when row is not expandable', () => {
    const items = flattenHubInspectorRows(
      rows,
      'b',
      (row) => row.id,
      (row) => row.expandable,
    );
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.kind === 'main')).toBe(true);
  });
});
