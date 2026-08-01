import { describe, expect, it } from 'vitest';
import { applyShortcutsColDefTransforms } from './transforms.js';
import { defaultShortcut } from './state.js';

describe('applyShortcutsColDefTransforms', () => {
  const shortcuts = [
    { ...defaultShortcut('Multiply'), shortcutKey: 'h', enabled: true },
  ];

  it('returns defs unchanged when no shortcut keys are configured', () => {
    const defs = [{ colId: 'qty', editable: true, cellDataType: 'number' }];
    expect(applyShortcutsColDefTransforms(defs, [])).toBe(defs);
  });

  it('wraps editable numeric columns with keyboard suppression', () => {
    const def = { colId: 'qty', editable: true, cellDataType: 'number' };
    const out = applyShortcutsColDefTransforms([def], shortcuts)[0] as {
      suppressKeyboardEvent?: (p: { event: { key: string }; editing: boolean }) => boolean;
    };
    expect(out).not.toBe(def);
    expect(out.suppressKeyboardEvent?.({
      event: { key: 'H' },
      editing: false,
    })).toBe(true);
    expect(out.suppressKeyboardEvent?.({
      event: { key: 'H' },
      editing: true,
    })).toBe(false);
    expect(out.suppressKeyboardEvent?.({
      event: { key: 'Enter' },
      editing: false,
    })).toBe(false);
  });

  it('skips non-editable and non-numeric columns', () => {
    const text = { colId: 'name', editable: true, cellDataType: 'text' };
    const locked = { colId: 'id', editable: false, cellDataType: 'number' };
    const out = applyShortcutsColDefTransforms([text, locked], shortcuts);
    expect(out[0]).toBe(text);
    expect(out[1]).toBe(locked);
  });

  it('recurses into column groups without mutating unchanged children', () => {
    const child = { colId: 'qty', editable: true, cellDataType: 'number' };
    const group = { headerName: 'G', children: [child] };
    const out = applyShortcutsColDefTransforms([group], shortcuts)[0] as {
      children: Array<{ suppressKeyboardEvent?: unknown }>;
    };
    expect(typeof out.children[0]?.suppressKeyboardEvent).toBe('function');
  });

  it('chains with an existing suppressKeyboardEvent handler', () => {
    const def = {
      colId: 'qty',
      editable: true,
      cellDataType: 'number',
      suppressKeyboardEvent: () => true,
    };
    const out = applyShortcutsColDefTransforms([def], shortcuts)[0] as {
      suppressKeyboardEvent: (p: { event: { key: string }; editing: boolean }) => boolean;
    };
    expect(out.suppressKeyboardEvent({ event: { key: 'x' }, editing: false })).toBe(true);
  });
});
