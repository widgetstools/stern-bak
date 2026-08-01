import { describe, expect, it } from 'vitest';
import {
  INITIAL_SHORTCUTS,
  SHORTCUTS_MODULE_ID,
  defaultShortcut,
} from '@wellsfargo-starui/engine';
import { shortcutsModule } from './index';

describe('shortcutsModule', () => {
  it('registers with expected metadata', () => {
    expect(shortcutsModule.id).toBe(SHORTCUTS_MODULE_ID);
    expect(shortcutsModule.code).toBe('09');
  });

  it('getInitialState returns a clone', () => {
    const state = shortcutsModule.getInitialState();
    expect(state).toEqual(INITIAL_SHORTCUTS);
    expect(state).not.toBe(INITIAL_SHORTCUTS);
  });

  it('transformColumnDefs is no-op when disabled', () => {
    const defs = [{ field: 'qty' }];
    const out = shortcutsModule.transformColumnDefs!(defs, {
      ...INITIAL_SHORTCUTS,
      settings: { ...INITIAL_SHORTCUTS.settings, enabled: false },
    });
    expect(out).toBe(defs);
  });

  it('transformColumnDefs applies shortcut transforms when enabled', () => {
    const defs = [{ field: 'qty', editable: true, colId: 'qty' }];
    const state = {
      ...INITIAL_SHORTCUTS,
      shortcuts: [{
        ...defaultShortcut('Halve'),
        shortcutKey: 'h',
        scope: { columnIds: ['qty'] },
      }],
    };
    const out = shortcutsModule.transformColumnDefs!(defs, state);
    expect(out).not.toBe(defs);
  });

  it('serialize / deserialize round-trip', () => {
    const state = shortcutsModule.getInitialState();
    const raw = shortcutsModule.serialize!(state);
    expect(shortcutsModule.deserialize!(raw)).toEqual(state);
  });
});
