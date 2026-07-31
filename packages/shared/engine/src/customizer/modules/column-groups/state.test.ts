import { describe, expect, it } from 'vitest';
import {
  INITIAL_COLUMN_GROUPS,
  isColumnGroupsState,
} from './state.js';

describe('column-groups state', () => {
  it('starts empty', () => {
    expect(INITIAL_COLUMN_GROUPS).toEqual({ groups: [], openGroupIds: {} });
  });

  it('isColumnGroupsState rejects malformed snapshots', () => {
    expect(isColumnGroupsState(null)).toBe(false);
    expect(isColumnGroupsState({ groups: 'nope', openGroupIds: {} })).toBe(false);
    expect(isColumnGroupsState({ groups: [], openGroupIds: null })).toBe(false);
    expect(isColumnGroupsState({ groups: [], openGroupIds: {} })).toBe(true);
  });
});
