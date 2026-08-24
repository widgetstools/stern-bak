import { describe, expect, it } from 'vitest';
import {
  resolveCollection,
  readItems,
  writeItems,
  itemId,
  collectionsForModule,
  MODULE_COLLECTIONS,
} from './moduleCollections';

const RULES = MODULE_COLLECTIONS.find((c) => c.moduleId === 'conditional-styling')!;
const ASSIGNMENTS = MODULE_COLLECTIONS.find((c) => c.moduleId === 'column-customization')!;

describe('resolveCollection', () => {
  it('infers the collection when a module has exactly one', () => {
    const res = resolveCollection('saved-filters', undefined);
    expect(res.ok && res.spec.collection).toBe('filters');
  });

  it('requires a choice when a module has several, and names them', () => {
    const res = resolveCollection('alerts', undefined);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('rules');
    expect(res.ok === false && res.error).toContain('history');
  });

  it('points settings-only modules at the right tool', () => {
    const res = resolveCollection('general-settings', undefined);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('update_module_settings');
  });

  it('rejects a collection that does not belong to the module', () => {
    const res = resolveCollection('saved-filters', 'rules');
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('filters');
  });

  it('marks the runtime-owned alert history read-only', () => {
    const history = collectionsForModule('alerts').find((c) => c.collection === 'history');
    expect(history?.readOnly).toBe(true);
  });
});

describe('array-backed collections', () => {
  it('reads, round-trips and preserves order', () => {
    const data = { rules: [{ id: 'a' }, { id: 'b' }] };
    const items = readItems(data, RULES);
    expect(items.map((i) => itemId(i, RULES))).toEqual(['a', 'b']);
    expect(writeItems(RULES, items)).toEqual(data.rules);
  });

  it('treats a missing or malformed collection as empty', () => {
    expect(readItems(undefined, RULES)).toEqual([]);
    expect(readItems({ rules: 'nonsense' }, RULES)).toEqual([]);
  });
});

describe('record-backed collections', () => {
  /** Templates historically stored the key only in the map, not on the item —
   *  readItems folds it in so both kinds address items the same way. */
  it('folds the map key onto each item and rebuilds the map on write', () => {
    const data = { assignments: { ticker: { headerName: 'Ticker' } } };
    const items = readItems(data, ASSIGNMENTS);
    expect(items).toEqual([{ colId: 'ticker', headerName: 'Ticker' }]);
    expect(writeItems(ASSIGNMENTS, items)).toEqual({
      ticker: { colId: 'ticker', headerName: 'Ticker' },
    });
  });

  it('does not let an item without an id silently vanish into an undefined key', () => {
    expect(writeItems(ASSIGNMENTS, [{ headerName: 'orphan' }])).toEqual({});
  });
});
