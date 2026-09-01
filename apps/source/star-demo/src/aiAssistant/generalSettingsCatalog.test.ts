import { describe, expect, it } from 'vitest';
import { INITIAL_GENERAL_SETTINGS } from '@wellsfargo-starui/core';
import {
  GRID_OPTION_ENTRIES,
  GRID_OPTION_KEYS,
  findGridOption,
  buildGeneralSettingsGuide,
} from './generalSettingsCatalog';

/**
 * `generalSettingsCatalog.ts` mirrors the grid's Grid Options surface rather
 * than importing it — the real declaration is a .tsx full of JSX editors.
 * This is what keeps the copy honest, and it is deliberately strict in BOTH
 * directions: a new Grid Option that nobody documents fails here, because an
 * undocumented key is one the model will never discover, and a key the model
 * invents writes cleanly and silently does nothing.
 */
describe('catalogue parity with the general-settings module', () => {
  const stateKeys = Object.keys(INITIAL_GENERAL_SETTINGS as unknown as Record<string, unknown>);

  it('documents every settable key', () => {
    const missing = stateKeys.filter((k) => !GRID_OPTION_KEYS.includes(k));
    expect(missing, `undocumented Grid Options: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not document a key the module does not have', () => {
    const extra = GRID_OPTION_KEYS.filter((k) => !stateKeys.includes(k));
    expect(extra, `catalogue names keys that no longer exist: ${extra.join(', ')}`).toEqual([]);
  });

  it('has no duplicate keys', () => {
    expect(new Set(GRID_OPTION_KEYS).size).toBe(GRID_OPTION_KEYS.length);
  });

  it('gives every entry a band so the guide can group it', () => {
    for (const e of GRID_OPTION_ENTRIES) {
      expect(e.band.length, e.key).toBeGreaterThan(0);
      expect(e.kind.length, e.key).toBeGreaterThan(0);
    }
  });

  it('left no entry with the placeholder band the generator emits when it cannot classify one', () => {
    const unclassified = GRID_OPTION_ENTRIES.filter((e) => e.band === 'OTHER' || e.kind === 'unknown');
    expect(unclassified.map((e) => e.key)).toEqual([]);
  });
});

describe('findGridOption', () => {
  it('finds a key that exists', () => {
    expect(findGridOption('rowHeight')?.band).toContain('ESSENTIALS');
  });

  it('returns undefined for one that does not', () => {
    expect(findGridOption('rowHieght')).toBeUndefined();
  });
});

describe('buildGeneralSettingsGuide', () => {
  const guide = buildGeneralSettingsGuide();

  it('names every settable key, so nothing is undiscoverable', () => {
    for (const key of GRID_OPTION_KEYS) {
      expect(guide.includes(`\`${key}\``), `guide never mentions "${key}"`).toBe(true);
    }
  });

  /**
   * The two the audit found were reachable but undiscoverable — present in the
   * module, named in no guide and no prompt.
   */
  it('calls out expand-all and pivot mode explicitly', () => {
    expect(guide).toContain('groupDefaultExpanded');
    expect(guide).toContain('-1');
    expect(guide).toContain('pivotMode');
  });

  it('spells out that the write is a shallow merge', () => {
    expect(guide.toLowerCase()).toContain('shallow-merge');
  });

  it('lists the accepted values for a select field', () => {
    expect(guide).toContain('One of:');
  });
});
