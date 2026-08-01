import { describe, expect, it } from 'vitest';
import type { ColumnGroupNode } from './state.js';
import {
  collectAssignedColIds,
  collectGroupIds,
  composeGroups,
  groupHeaderBorderOverlayCSS,
  groupHeaderStyleToCSS,
  hasHeaderBorders,
  hasHeaderStyle,
} from './composeGroups.js';

function group(
  groupId: string,
  headerName: string,
  children: ColumnGroupNode['children'],
  extra: Partial<ColumnGroupNode> = {},
): ColumnGroupNode {
  return { groupId, headerName, children, ...extra };
}

describe('composeGroups', () => {
  const defs = [
    { colId: 'a', field: 'a' },
    { colId: 'b', field: 'b' },
    { colId: 'c', field: 'c' },
  ];

  it('returns defs unchanged when no groups authored', () => {
    expect(composeGroups(defs, [], {})).toBe(defs);
  });

  it('nests columns under a group at the first child display slot', () => {
    const groups = [group('g1', 'Group', [
      { kind: 'col', colId: 'b' },
      { kind: 'col', colId: 'c' },
    ])];
    const out = composeGroups(defs, groups, {});
    expect(out.map((d) => ('children' in d ? d.headerName : d.colId))).toEqual([
      'a',
      'Group',
    ]);
    const built = out[1] as { children: Array<{ colId?: string }> };
    expect(built.children.map((c) => c.colId)).toEqual(['b', 'c']);
  });

  it('skips missing columns and drops empty groups', () => {
    const groups = [group('empty', 'Empty', [{ kind: 'col', colId: 'ghost' }])];
    expect(composeGroups(defs, groups, {})).toEqual(defs);
  });

  it('dedupes colIds — first group wins', () => {
    const groups = [
      group('g1', 'One', [{ kind: 'col', colId: 'b' }]),
      group('g2', 'Two', [{ kind: 'col', colId: 'b' }, { kind: 'col', colId: 'c' }]),
    ];
    const out = composeGroups(defs, groups, {});
    const g2 = out.find((d) => 'groupId' in d && d.groupId === 'g2') as
      | { children: Array<{ colId?: string }> }
      | undefined;
    expect(g2?.children.map((c) => c.colId)).toEqual(['c']);
  });

  it('applies runtime openGroupIds over editor openByDefault', () => {
    const groups = [group('g1', 'G', [{ kind: 'col', colId: 'a' }], { openByDefault: false })];
    const open = composeGroups(defs, groups, { g1: true })[0] as { openByDefault?: boolean };
    expect(open.openByDefault).toBe(true);
  });

  it('maps columnGroupShow for open/closed child visibility', () => {
    const groups = [group('g1', 'G', [{ kind: 'col', colId: 'a', show: 'closed' }])];
    const child = (composeGroups(defs, groups, {})[0] as { children: Array<{ columnGroupShow?: string }> })
      .children[0];
    expect(child?.columnGroupShow).toBe('closed');
  });

  it('leaves input defs untouched', () => {
    const input = [{ colId: 'a', field: 'a' }];
    composeGroups(input, [group('g', 'G', [{ kind: 'col', colId: 'a' }])], {});
    expect(input[0]).toEqual({ colId: 'a', field: 'a' });
  });

  it('builds nested groups with header styling and marryChildren', () => {
    const groups = [group('root', 'Root', [
      {
        kind: 'group',
        group: group('inner', 'Inner', [{ kind: 'col', colId: 'b', show: 'open' }], {
          headerStyle: { bold: true },
          marryChildren: true,
        }),
      },
    ])];
    const out = composeGroups(defs, groups, {});
    const root = out.find((d) => 'groupId' in d && d.groupId === 'root') as {
      children: Array<{ groupId?: string; headerClass?: string; marryChildren?: boolean; children?: Array<{ columnGroupShow?: string }> }>;
    };
    expect(root?.children[0]?.headerClass).toContain('ds-hdr-grp-inner');
    expect(root?.children[0]?.marryChildren).toBe(true);
    expect(root?.children[0]?.children?.[0]?.columnGroupShow).toBe('open');
  });

  it('emits orphan groups whose columns are entirely missing from defs', () => {
    const groups = [group('orphan', 'Orphan', [{ kind: 'col', colId: 'missing' }])];
    expect(composeGroups(defs, groups, {})).toEqual(defs);
  });
});

describe('collectGroupIds / collectAssignedColIds', () => {
  const tree = [
    group('root', 'Root', [
      { kind: 'col', colId: 'a' },
      { kind: 'group', group: group('nested', 'Nested', [{ kind: 'col', colId: 'b' }]) },
    ]),
  ];

  it('collects every groupId in the tree', () => {
    expect([...collectGroupIds(tree)]).toEqual(['root', 'nested']);
  });

  it('collects every leaf colId', () => {
    expect([...collectAssignedColIds(tree)]).toEqual(['a', 'b']);
  });
});

describe('group header CSS helpers', () => {
  it('hasHeaderStyle detects typography and borders', () => {
    expect(hasHeaderStyle(undefined)).toBe(false);
    expect(hasHeaderStyle({ bold: true })).toBe(true);
    expect(hasHeaderBorders({
      borders: { top: { width: 1, color: '#000', style: 'solid' } },
    })).toBe(true);
  });

  it('groupHeaderStyleToCSS emits flex alignment for headers', () => {
    const css = groupHeaderStyleToCSS({ align: 'right', bold: true });
    expect(css).toContain('justify-content: flex-end');
    expect(css).toContain('font-weight: bold');
  });

  it('groupHeaderBorderOverlayCSS uses ::after overlay', () => {
    const css = groupHeaderBorderOverlayCSS('.hdr', {
      borders: { bottom: { width: 2, color: 'red', style: 'dashed' } },
    });
    expect(css).toContain('::after');
    expect(css).toContain('border-bottom: 2px dashed red');
  });
});
