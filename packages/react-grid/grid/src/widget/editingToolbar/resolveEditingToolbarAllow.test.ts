import { describe, expect, it } from 'vitest';
import { resolveEditingToolbarAllow, mergeEditingToolbarAllowWithModules } from './resolveEditingToolbarAllow';

describe('resolveEditingToolbarAllow', () => {
  it('returns all segments when showEditingToolbar is set alone', () => {
    expect(resolveEditingToolbarAllow({ showEditingToolbar: true })).toEqual({
      rowVisible: true,
      allowHistory: true,
      allowSmartEdit: true,
      allowBulkUpdate: true,
    });
  });

  it('returns all segments when showEditingToolbar is true and legacy props are omitted', () => {
    expect(resolveEditingToolbarAllow({
      showEditingToolbar: true,
      showSmartEditToolbar: undefined,
      showBulkUpdateToolbar: undefined,
      showEditHistoryToolbar: undefined,
    })).toEqual({
      rowVisible: true,
      allowHistory: true,
      allowSmartEdit: true,
      allowBulkUpdate: true,
    });
  });

  it('uses legacy props as an allow-list', () => {
    expect(resolveEditingToolbarAllow({
      showSmartEditToolbar: true,
      showEditHistoryToolbar: true,
    })).toEqual({
      rowVisible: true,
      allowHistory: true,
      allowSmartEdit: true,
      allowBulkUpdate: false,
    });
  });

  it('shows row when only legacy bulk/history props are set (unified prop default false)', () => {
    expect(resolveEditingToolbarAllow({
      showEditingToolbar: false,
      showBulkUpdateToolbar: true,
      showEditHistoryToolbar: true,
    })).toEqual({
      rowVisible: true,
      allowHistory: true,
      allowSmartEdit: false,
      allowBulkUpdate: true,
    });
  });

  it('hides the row when no props are set', () => {
    expect(resolveEditingToolbarAllow({})).toEqual({
      rowVisible: false,
      allowHistory: false,
      allowSmartEdit: false,
      allowBulkUpdate: false,
    });
  });
});

describe('mergeEditingToolbarAllowWithModules', () => {
  const hidden = {
    rowVisible: false,
    allowHistory: false,
    allowSmartEdit: false,
    allowBulkUpdate: false,
  };

  it('shows the row when smart-edit is enabled in profile and host did not opt out', () => {
    expect(
      mergeEditingToolbarAllowWithModules(hidden, {}, { smartEdit: true, bulkUpdate: false, history: false }),
    ).toEqual({
      rowVisible: true,
      allowHistory: true,
      allowSmartEdit: true,
      allowBulkUpdate: true,
    });
  });

  it('respects explicit showEditingToolbar: false', () => {
    expect(
      mergeEditingToolbarAllowWithModules(
        hidden,
        { showEditingToolbar: false },
        { smartEdit: true, bulkUpdate: true, history: true },
      ),
    ).toEqual(hidden);
  });

  it('does not override an already-visible host allow', () => {
    const base = resolveEditingToolbarAllow({ showSmartEditToolbar: true });
    expect(
      mergeEditingToolbarAllowWithModules(
        base,
        { showSmartEditToolbar: true },
        { smartEdit: false, bulkUpdate: false, history: false },
      ),
    ).toEqual(base);
  });
});
