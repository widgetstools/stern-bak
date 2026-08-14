import { describe, expect, it } from 'vitest';
import * as topics from './iabTopics.js';

/**
 * Pure string constants — coverage is trivial, but the values are a
 * cross-package contract (dock-editor, registry-editor, config-browser).
 * Pinning them here catches accidental renames.
 */

describe('iabTopics', () => {
  it('exports stable IAB topic names', () => {
    expect(topics.IAB_DOCK_CONFIG_UPDATE).toBe('dock-config-update');
    expect(topics.IAB_RELOAD_AFTER_IMPORT).toBe('reload-dock-after-import');
    expect(topics.IAB_THEME_CHANGED).toBe('theme-changed');
    expect(topics.IAB_REGISTRY_CONFIG_UPDATE).toBe('registry-config-update');
  });

  it('exports stable action id constants', () => {
    expect(topics.ACTION_LAUNCH_APP).toBe('launch-app');
    expect(topics.ACTION_TOGGLE_THEME).toBe('toggle-theme');
    expect(topics.ACTION_RELOAD_DOCK).toBe('reload-dock');
    expect(topics.ACTION_SHOW_DEVTOOLS).toBe('show-devtools');
    expect(topics.ACTION_INSPECT_SHARED_WORKER).toBe('inspect-shared-worker');
    expect(topics.ACTION_EXPORT_CONFIG).toBe('export-config');
    expect(topics.ACTION_TOGGLE_PROVIDER).toBe('toggle-provider-window');
    expect(topics.ACTION_OPEN_CONFIG_BROWSER).toBe('open-config-browser');
    expect(topics.ACTION_OPEN_WORKSPACE_SETUP).toBe('open-workspace-setup');
    expect(topics.ACTION_OPEN_DATA_PROVIDERS).toBe('open-data-providers');
    expect(topics.ACTION_LAUNCH_COMPONENT).toBe('launch-component');
  });

  it('uses non-empty kebab-case ids for every action', () => {
    const actions = Object.entries(topics).filter(([k]) => k.startsWith('ACTION_'));
    expect(actions.length).toBeGreaterThan(0);
    for (const [key, value] of actions) {
      expect(typeof value, key).toBe('string');
      expect((value as string).length, key).toBeGreaterThan(0);
      expect(value, key).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});
