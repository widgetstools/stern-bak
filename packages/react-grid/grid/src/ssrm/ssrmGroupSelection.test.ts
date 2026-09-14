import { describe, expect, it } from 'vitest';
import {
  countGroupSelection,
  filterRowsByGroupSelection,
  isGroupSelectionState,
  leafCountLookupFromApi,
  type LeafCountLookup,
} from './ssrmGroupSelection.js';

describe('isGroupSelectionState', () => {
  it('accepts the groupSelects tree and rejects the flat shape', () => {
    expect(isGroupSelectionState({ selectAllChildren: true })).toBe(true);
    expect(isGroupSelectionState({ toggledNodes: [{ nodeId: 'Rates' }] })).toBe(true);
    expect(isGroupSelectionState({ selectAll: true, toggledNodes: ['a'] })).toBe(false);
    expect(isGroupSelectionState(null)).toBe(false);
    expect(isGroupSelectionState({})).toBe(false);
  });
});

describe('countGroupSelection', () => {
  const counts: LeafCountLookup = (id) => (
    { Rates: 60, Credit: 40, '1:Rates:NY': 25 } as Record<string, number>
  )[id] ?? (id.startsWith('leaf') ? 1 : null);

  it('counts a whole-book select-all', () => {
    expect(countGroupSelection({ selectAllChildren: true }, 100, counts)).toBe(100);
  });

  it('subtracts a deselected group from a select-all', () => {
    const state = {
      selectAllChildren: true,
      toggledNodes: [{ nodeId: 'Credit', selectAllChildren: false }],
    };
    expect(countGroupSelection(state, 100, counts)).toBe(60);
  });

  it('adds a selected group under a deselected root', () => {
    const state = {
      selectAllChildren: false,
      toggledNodes: [{ nodeId: 'Rates', selectAllChildren: true }],
    };
    expect(countGroupSelection(state, 100, counts)).toBe(60);
  });

  it('resolves toggles two levels deep, leaves counting one each', () => {
    // Rates selected, but its NY sub-group deselected except one leaf.
    const state = {
      selectAllChildren: false,
      toggledNodes: [{
        nodeId: 'Rates',
        selectAllChildren: true,
        toggledNodes: [{
          nodeId: '1:Rates:NY',
          selectAllChildren: false,
          toggledNodes: [{ nodeId: 'leaf-7' }],
        }],
      }],
    };
    // 60 − (25 − 1)
    expect(countGroupSelection(state, 100, counts)).toBe(36);
  });

  it('answers null when a toggled group is not loaded — never a guess', () => {
    const state = {
      selectAllChildren: true,
      toggledNodes: [{ nodeId: 'NotLoadedGroup', selectAllChildren: false }],
    };
    expect(countGroupSelection(state, 100, counts)).toBeNull();
  });
});

describe('leafCountLookupFromApi', () => {
  it('reads group __count and counts leaves as one', () => {
    const nodes = [
      { id: 'Rates', group: true, data: { __count: 60 } },
      { id: 'r1', group: false, data: { id: 'r1' } },
      { id: 'stub', group: false, data: null },
    ];
    const lookup = leafCountLookupFromApi({
      forEachNode: (fn) => { for (const n of nodes) fn(n as never); },
    });
    expect(lookup('Rates')).toBe(60);
    expect(lookup('r1')).toBe(1);
    expect(lookup('stub')).toBeNull();
    expect(lookup('missing')).toBeNull();
  });
});

describe('filterRowsByGroupSelection', () => {
  const rows = [
    { positionId: 'a', desk: 'Rates', region: 'NY' },
    { positionId: 'b', desk: 'Rates', region: 'LDN' },
    { positionId: 'c', desk: 'Credit', region: 'NY' },
  ];
  const idOf = (row: Record<string, unknown>): string => String(row.positionId);

  it('keeps rows whose deepest toggled ancestor selects them', () => {
    const state = {
      selectAllChildren: false,
      toggledNodes: [{ nodeId: 'Rates', selectAllChildren: true }],
    };
    expect(filterRowsByGroupSelection(rows, state, ['desk'], idOf)).toEqual([rows[0], rows[1]]);
  });

  it('honours a leaf toggle under a selected group', () => {
    const state = {
      selectAllChildren: false,
      toggledNodes: [{
        nodeId: 'Rates',
        selectAllChildren: true,
        toggledNodes: [{ nodeId: '1:Rates:b' }],
      }],
    };
    expect(filterRowsByGroupSelection(rows, state, ['desk'], idOf)).toEqual([rows[0]]);
  });

  it('resolves two group levels with the level:parents:key id shape', () => {
    const state = {
      selectAllChildren: true,
      toggledNodes: [{
        nodeId: 'Rates',
        selectAllChildren: true,
        toggledNodes: [{ nodeId: '1:Rates:LDN', selectAllChildren: false }],
      }],
    };
    expect(filterRowsByGroupSelection(rows, state, ['desk', 'region'], idOf))
      .toEqual([rows[0], rows[2]]);
  });

  it('returns null with no grouping — the caller falls back', () => {
    expect(filterRowsByGroupSelection(rows, { selectAllChildren: true }, [], idOf)).toBeNull();
  });
});
