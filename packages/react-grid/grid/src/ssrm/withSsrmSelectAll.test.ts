import { describe, expect, it } from 'vitest';
import { withSsrmSelectAll } from './withSsrmSelectAll.js';

describe('withSsrmSelectAll', () => {
  it('adds selectAll: all for multiRow header checkboxes', () => {
    expect(withSsrmSelectAll({
      mode: 'multiRow',
      checkboxes: true,
      headerCheckbox: true,
    })).toEqual({
      mode: 'multiRow',
      checkboxes: true,
      headerCheckbox: true,
      selectAll: 'all',
    });
  });

  it('leaves single-row and checkbox-less selection alone', () => {
    expect(withSsrmSelectAll({ mode: 'singleRow', checkboxes: true })).toEqual({
      mode: 'singleRow',
      checkboxes: true,
    });
    expect(withSsrmSelectAll({
      mode: 'multiRow',
      checkboxes: false,
      headerCheckbox: false,
    })).toEqual({
      mode: 'multiRow',
      checkboxes: false,
      headerCheckbox: false,
    });
    expect(withSsrmSelectAll(undefined)).toBeUndefined();
  });
});
