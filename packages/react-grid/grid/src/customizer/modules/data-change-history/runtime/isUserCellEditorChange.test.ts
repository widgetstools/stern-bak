import { describe, expect, it } from 'vitest';
import { isUserCellEditorChange } from './isUserCellEditorChange.js';

describe('isUserCellEditorChange', () => {
  it('allows edit, ui, and missing source', () => {
    expect(isUserCellEditorChange({ source: 'edit' } as never)).toBe(true);
    expect(isUserCellEditorChange({ source: 'ui' } as never)).toBe(true);
    expect(isUserCellEditorChange({} as never)).toBe(true);
  });

  it('blocks api and undo sources', () => {
    expect(isUserCellEditorChange({ source: 'api' } as never)).toBe(false);
    expect(isUserCellEditorChange({ source: 'undo' } as never)).toBe(false);
    expect(isUserCellEditorChange({ source: 'paste' } as never)).toBe(false);
  });
});
