import { describe, expect, it } from 'vitest';
import { resolveEditingToolbarAllow, mergeEditingToolbarAllowWithModules } from './resolveEditingToolbarAllow';

describe('resolveEditingToolbarAllow', () => {
  it('returns all segments when showEditingToolbar is set', () => {
    expect(resolveEditingToolbarAllow({ showEditingToolbar: true })).toEqual({
      rowVisible: true,
      allowHistory: true,
      allowSmartEdit: true,
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

  it('hides the row on explicit showEditingToolbar: false', () => {
    expect(resolveEditingToolbarAllow({ showEditingToolbar: false })).toEqual({
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
    const base = resolveEditingToolbarAllow({ showEditingToolbar: true });
    expect(
      mergeEditingToolbarAllowWithModules(
        base,
        { showEditingToolbar: true },
        { smartEdit: false, bulkUpdate: false, history: false },
      ),
    ).toEqual(base);
  });

  it('stays hidden when no module is enabled', () => {
    expect(
      mergeEditingToolbarAllowWithModules(hidden, {}, { smartEdit: false, bulkUpdate: false, history: false }),
    ).toEqual(hidden);
  });
});
