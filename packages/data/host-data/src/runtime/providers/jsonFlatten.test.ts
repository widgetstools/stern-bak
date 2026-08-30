import { describe, expect, it } from 'vitest';
import { compileFlattenPlan, flattenJsonText, flattenRow } from './jsonFlatten';

const PLAN = compileFlattenPlan([
  'id',
  'px',
  'risk.dv01',
  'risk', // opaque AND a prefix of risk.dv01
  'legs[0].rate',
  'legs[1].schedule.end',
  'tenors[2]',
  '["a.b"].c',
  'm[1][0]',
  'flags',
  'missing.path',
  'id', // repeat → one column
]);

const ROW = {
  id: 'r1',
  px: 99.5,
  risk: { dv01: 120, cs01: 80 },
  legs: [
    { rate: 0.05, schedule: { start: '2026-01-01', end: '2031-01-01' } },
    { rate: 0.03, schedule: { start: '2026-01-01', end: '2036-01-01' } },
  ],
  tenors: [1, 2, 3, 4],
  'a.b': { c: 'lit' },
  m: [[1, 2], [3, 4]],
  flags: [true, false],
  junk: { deep: { deeper: [1, 2, 3] } },
};

describe('compileFlattenPlan', () => {
  it('lists columns in first-seen order, deduped', () => {
    expect(PLAN.columns).toEqual([
      'id', 'px', 'risk.dv01', 'risk', 'legs[0].rate', 'legs[1].schedule.end', 'tenors[2]',
      '["a.b"].c', 'm[1][0]', 'flags', 'missing.path',
    ]);
  });

  it('lets a node be both a column and a prefix', () => {
    const risk = PLAN.root.keys!.get('risk')!;
    expect(risk.leaf).toBe('risk');
    expect(risk.keys!.get('dv01')!.leaf).toBe('risk.dv01');
  });

  it('ignores blank paths', () => {
    expect(compileFlattenPlan(['', 'a']).columns).toEqual(['a']);
  });
});

describe('flattenRow', () => {
  it('flattens scalars, positional array elements, quoted keys and nested arrays', () => {
    expect(flattenRow(ROW, PLAN)).toEqual({
      id: 'r1',
      px: 99.5,
      'risk.dv01': 120,
      risk: '{"dv01":120,"cs01":80}',
      'legs[0].rate': 0.05,
      'legs[1].schedule.end': '2036-01-01',
      'tenors[2]': 3,
      '["a.b"].c': 'lit',
      'm[1][0]': 3,
      flags: '[true,false]',
    });
  });

  it('omits missing paths, short arrays and non-containers on the way', () => {
    expect(flattenRow({ id: 'r2', risk: null, legs: [{ rate: 1 }], tenors: [1] }, PLAN)).toEqual({
      id: 'r2',
      risk: null,
      'legs[0].rate': 1,
    });
    expect(flattenRow({ risk: 5, legs: 'nope' }, PLAN)).toEqual({ risk: 5 });
  });

  it('does not read arrays through key segments or objects through index segments', () => {
    expect(flattenRow({ legs: { 0: { rate: 9 } }, risk: [1] }, PLAN)).toEqual({ risk: '[1]' });
  });

  it('returns an empty object for non-object rows', () => {
    expect(flattenRow(null, PLAN)).toEqual({});
    expect(flattenRow(42, PLAN)).toEqual({});
  });
});

describe('flattenJsonText', () => {
  const rows = [
    ROW,
    { id: 'r2', px: -1.5e-3, risk: null, legs: [{ rate: 1 }], tenors: [1] },
    { id: 'q"uo\\te\n', px: 0, risk: { dv01: 'x"y' }, legs: [], flags: [] },
    { id: 'ünïcødé 🚀', risk: {}, m: [[], []], 'a.b': { c: null } },
    { legs: [{ rate: true }, { schedule: { end: false } }], extra: [1, [2, [3, { four: 4 }]]] },
  ];

  it('matches flattenRow(JSON.parse(text)) row for row on compact JSON', () => {
    const text = JSON.stringify(rows);
    const flat = JSON.parse(flattenJsonText(text, PLAN)) as unknown[];
    expect(flat).toEqual(rows.map((r) => flattenRow(r, PLAN)));
  });

  it('handles a single object and an empty array', () => {
    expect(JSON.parse(flattenJsonText(JSON.stringify(ROW), PLAN))).toEqual(flattenRow(ROW, PLAN));
    expect(flattenJsonText('[]', PLAN)).toBe('[]');
    expect(flattenJsonText(' [ ] ', PLAN)).toBe('[]');
  });

  it('tolerates pretty-printed input (whitespace everywhere)', () => {
    const plan = compileFlattenPlan(['id', 'risk.dv01', 'legs[1].schedule.end', 'tenors[2]']);
    const text = JSON.stringify(rows, null, 2);
    expect(JSON.parse(flattenJsonText(text, plan))).toEqual(rows.map((r) => flattenRow(r, plan)));
  });

  it('matches member keys that carry escapes', () => {
    const plan = compileFlattenPlan(['["we\\"ird"].v', 'plain']);
    const row = { 'we"ird': { v: 1 }, plain: 2 };
    expect(JSON.parse(flattenJsonText(JSON.stringify([row]), plan))).toEqual([{ '["we\\"ird"].v': 1, plain: 2 }]);
  });

  it('keeps last-wins semantics for duplicate keys, like JSON.parse', () => {
    expect(JSON.parse(flattenJsonText('[{"id":1,"id":2}]', compileFlattenPlan(['id'])))).toEqual([{ id: 2 }]);
  });

  it('emits {} for rows that are not objects', () => {
    expect(flattenJsonText('[1,"s",null,[1]]', PLAN)).toBe('[{},{},{},{}]');
  });

  it.each([
    ['[{"id":1}', 'expected "," or "]"'],
    ['[{"id":1,}]', 'expected a member key'],
    ['[{"id" 1}]', 'expected ":"'],
    ['[{"id":"abc}]', 'unterminated string'],
    ['[{"id":{"x":1}]', 'expected "," or "}"'],
    ['[{"legs":[1,2}]', 'expected "," or "]"'],
    // Unrequested subtrees are skipped by a depth counter that does not
    // pair bracket kinds — the error surfaces one token later instead.
    ['[{"junk":[1,2}]', 'expected "," or "}"'],
    ['[{"junk":[1,2', 'unterminated container'],
    ['42', 'expected an object'],
    ['[{"id":}]', 'expected a value'],
  ])('rejects malformed input %j', (text, detail) => {
    expect(() => flattenJsonText(text, PLAN)).toThrow(SyntaxError);
    expect(() => flattenJsonText(text, PLAN)).toThrow(detail);
  });
});
