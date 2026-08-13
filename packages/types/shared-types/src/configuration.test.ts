import { describe, expect, it } from 'vitest';
import { COMPONENT_SUBTYPES, COMPONENT_TYPES } from './configuration.js';

/**
 * `componentType` / `componentSubType` are persisted verbatim into
 * IndexedDB rows and into the REST config service. A renamed value
 * orphans every already-stored row, so the wire strings are pinned
 * rather than merely spot-checked.
 */
describe('COMPONENT_TYPES', () => {
  it('pins every persisted componentType string', () => {
    expect(COMPONENT_TYPES).toEqual({
      DATASOURCE: 'datasource',
      DATA_PROVIDER: 'data-provider',
      GRID: 'grid',
      DATA_GRID: 'data-grid',
      PROFILE: 'profile',
      WORKSPACE: 'workspace',
      PAGE: 'page',
      THEME: 'theme',
      LAYOUT: 'layout',
      DOCK: 'dock',
      DOCK_CONFIG: 'dock-config',
      COMPONENT_REGISTRY: 'component-registry',
      MARKETS_GRID_PROFILE_SET: 'markets-grid-profile-set',
      SIMPLE_BLOTTER: 'simple-blotter',
      SIMPLE_BLOTTER_LAYOUT: 'simple-blotter-layout',
      CUSTOM: 'custom',
    });
  });

  it('has no duplicate values — the type union would silently collapse', () => {
    const values = Object.values(COMPONENT_TYPES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('COMPONENT_SUBTYPES', () => {
  it('pins every persisted componentSubType string', () => {
    expect(COMPONENT_SUBTYPES).toEqual({
      STOMP: 'stomp',
      REST: 'rest',
      MOCK: 'mock',
      DOCK_APPLICATIONS_MENU_ITEMS: 'dock-applications-menu-items',
      DEFAULT: 'default',
      CUSTOM: 'custom',
      SHARED: 'shared',
      DIRECT: 'direct',
    });
  });

  it('has no duplicate values', () => {
    const values = Object.values(COMPONENT_SUBTYPES);
    expect(new Set(values).size).toBe(values.length);
  });
});
