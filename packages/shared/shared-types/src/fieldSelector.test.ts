import { describe, expect, it } from 'vitest';
import type { FieldInfo } from './dataProvider.js';
import {
  collectNonObjectLeaves,
  convertFieldInfoToNode,
  convertFieldNodeToInfo,
  filterFields,
  findFieldByPath,
  type FieldNode,
} from './fieldSelector.js';

function info(path: string, type: FieldInfo['type'], children?: Record<string, FieldInfo>): FieldInfo {
  return { path, type, nullable: false, ...(children ? { children } : {}) };
}

function node(path: string, type: FieldNode['type'], children?: FieldNode[]): FieldNode {
  const parts = path.split('.');
  return {
    path,
    name: parts[parts.length - 1],
    type,
    nullable: false,
    ...(children ? { children } : {}),
  };
}

describe('convertFieldInfoToNode', () => {
  it('derives the display name from the last path segment', () => {
    const out = convertFieldInfoToNode(info('position.ratings.moody', 'string'));
    expect(out.name).toBe('moody');
    expect(out.path).toBe('position.ratings.moody');
  });

  it('carries nullable and sample through', () => {
    const out = convertFieldInfoToNode({ path: 'px', type: 'number', nullable: true, sample: 101.25 });
    expect(out.nullable).toBe(true);
    expect(out.sample).toBe(101.25);
  });

  it('recurses into children and drops the record keys in favour of the path', () => {
    const out = convertFieldInfoToNode(
      info('position', 'object', {
        cusip: info('position.cusip', 'string'),
        ratings: info('position.ratings', 'object', {
          moody: info('position.ratings.moody', 'string'),
        }),
      }),
    );
    expect(out.children?.map((c) => c.path)).toEqual(['position.cusip', 'position.ratings']);
    expect(out.children?.[1].children?.[0].name).toBe('moody');
  });

  it('omits `children` entirely when the children record is empty', () => {
    // A present-but-empty array would make `collectNonObjectLeaves` treat
    // the node as an object branch with no leaves instead of a leaf.
    const out = convertFieldInfoToNode(info('empty', 'object', {}));
    expect('children' in out).toBe(false);
  });
});

describe('convertFieldNodeToInfo', () => {
  it('round-trips a nested tree back to the server schema shape', () => {
    const original = info('position', 'object', {
      cusip: info('position.cusip', 'string'),
      ratings: info('position.ratings', 'object', {
        moody: info('position.ratings.moody', 'string'),
      }),
    });
    const roundTripped = convertFieldNodeToInfo(convertFieldInfoToNode(original));
    expect(roundTripped).toEqual({
      path: 'position',
      type: 'object',
      nullable: false,
      sample: undefined,
      children: {
        cusip: { path: 'position.cusip', type: 'string', nullable: false, sample: undefined },
        ratings: {
          path: 'position.ratings',
          type: 'object',
          nullable: false,
          sample: undefined,
          children: {
            moody: { path: 'position.ratings.moody', type: 'string', nullable: false, sample: undefined },
          },
        },
      },
    });
  });

  it('keys children by the leaf segment, not the full path', () => {
    const out = convertFieldNodeToInfo(node('a', 'object', [node('a.b', 'string')]));
    expect(Object.keys(out.children!)).toEqual(['b']);
  });

  it('omits `children` for a leaf', () => {
    expect(convertFieldNodeToInfo(node('px', 'number')).children).toBeUndefined();
  });
});

describe('collectNonObjectLeaves', () => {
  it('returns the leaf paths of a nested tree, skipping the branches', () => {
    const tree = node('position', 'object', [
      node('position.cusip', 'string'),
      node('position.ratings', 'object', [
        node('position.ratings.moody', 'string'),
        node('position.ratings.sp', 'string'),
      ]),
    ]);
    expect(collectNonObjectLeaves(tree)).toEqual([
      'position.cusip',
      'position.ratings.moody',
      'position.ratings.sp',
    ]);
  });

  it('returns the node itself when it is a childless non-object', () => {
    expect(collectNonObjectLeaves(node('px', 'number'))).toEqual(['px']);
  });

  it('returns nothing for a childless object — nothing selectable inside it', () => {
    expect(collectNonObjectLeaves(node('meta', 'object'))).toEqual([]);
  });

  it('drops a childless object nested under a branch', () => {
    const tree = node('root', 'object', [
      node('root.hollow', 'object'),
      node('root.px', 'number'),
    ]);
    expect(collectNonObjectLeaves(tree)).toEqual(['root.px']);
  });

  it('treats an empty children array as a branch with no leaves', () => {
    expect(collectNonObjectLeaves({ ...node('px', 'number'), children: [] })).toEqual([]);
  });
});

describe('findFieldByPath', () => {
  const fields = [
    node('trade', 'object', [
      node('trade.id', 'string'),
      node('trade.leg', 'object', [node('trade.leg.px', 'number')]),
    ]),
    node('px', 'number'),
  ];

  it('finds a top-level field', () => {
    expect(findFieldByPath('px', fields)?.type).toBe('number');
  });

  it('finds a deeply nested field', () => {
    expect(findFieldByPath('trade.leg.px', fields)?.name).toBe('px');
  });

  it('returns undefined for an unknown path', () => {
    expect(findFieldByPath('trade.missing', fields)).toBeUndefined();
  });

  it('returns undefined for an empty field list', () => {
    expect(findFieldByPath('anything', [])).toBeUndefined();
  });
});

describe('filterFields', () => {
  const fields = [
    node('trade', 'object', [
      node('trade.cusip', 'string'),
      node('trade.quantity', 'number'),
    ]),
    node('price', 'number'),
  ];

  it('returns the input untouched for a blank or whitespace-only query', () => {
    expect(filterFields(fields, '')).toBe(fields);
    expect(filterFields(fields, '   ')).toBe(fields);
  });

  it('matches leaves case-insensitively on name', () => {
    const out = filterFields(fields, 'PRICE');
    expect(out.map((f) => f.path)).toEqual(['price']);
  });

  it('keeps a parent whose children match, narrowed to the matching children', () => {
    const out = filterFields(fields, 'cusip');
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe('trade');
    expect(out[0].children?.map((c) => c.path)).toEqual(['trade.cusip']);
  });

  it('keeps ALL children when the parent itself matches but no child does', () => {
    // The parent matching is treated as "the whole subtree is relevant" —
    // otherwise picking a matched group would surface an empty group.
    const out = filterFields(fields, 'trade');
    expect(out[0].children?.map((c) => c.path)).toEqual(['trade.cusip', 'trade.quantity']);
  });

  it('drops branches and leaves that match nothing', () => {
    expect(filterFields(fields, 'zzz')).toEqual([]);
  });

  it('matches on the path even when the leaf name does not contain the query', () => {
    const out = filterFields([node('trade.settlementDate', 'date')], 'trade.');
    expect(out.map((f) => f.path)).toEqual(['trade.settlementDate']);
  });

  it('does not mutate the input tree', () => {
    const before = JSON.parse(JSON.stringify(fields));
    filterFields(fields, 'cusip');
    expect(fields).toEqual(before);
  });
});
