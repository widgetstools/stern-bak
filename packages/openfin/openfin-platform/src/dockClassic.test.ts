/**
 * Classic dock (dock2) converter — DockEditorConfig → classic dock buttons.
 *
 * The classic `Dock.register` API renders DropdownButtons directly on the
 * dock bar as icon dropdowns whose options carry their own icons (no
 * two-column content menu). These tests lock in the mapping: button kinds,
 * action wiring, nested options, and per-theme icon resolution.
 */

import { describe, it, expect } from 'vitest';
import {
  toDock2Buttons,
  type DockEditorConfig,
} from './dockConfigTypes';

const generateIcon = (iconId: string, color: string): string => `icon:${iconId}:${color}`;
const recolorUrl = (url: string, color: string): string => `${url}?c=${color}`;
const DARK = '#fff';
const LIGHT = '#000';

function convert(config: DockEditorConfig, theme: 'dark' | 'light' = 'dark') {
  return toDock2Buttons(config, generateIcon, recolorUrl, DARK, LIGHT, theme);
}

describe('toDock2Buttons — classic dock button conversion', () => {
  it('maps an ActionButton to an action button with its action + icon', () => {
    const [btn] = convert({
      version: 1,
      updatedAt: '',
      buttons: [
        {
          type: 'ActionButton',
          id: 'a1',
          tooltip: 'Launch X',
          iconUrl: '',
          iconId: 'lucide:rocket',
          actionId: 'launch-app',
          customData: { appId: 'x' },
        },
      ],
    });

    expect(btn.type).toBe('ActionButton');
    expect(btn.tooltip).toBe('Launch X');
    expect(btn.iconUrl).toBe('icon:lucide:rocket:#fff'); // dark theme
    expect(btn.action).toEqual({ id: 'launch-app', customData: { appId: 'x' } });
    expect(btn.options).toBeUndefined();
  });

  it('maps a DropdownButton to a dropdown whose leaf options carry actions + icons', () => {
    const [btn] = convert({
      version: 1,
      updatedAt: '',
      buttons: [
        {
          type: 'DropdownButton',
          id: 'd1',
          tooltip: 'Muni PnL',
          iconUrl: '',
          iconId: 'lucide:bar-chart',
          options: [
            { id: 'o1', tooltip: 'Open A', iconId: 'lucide:file', actionId: 'open-a', customData: { v: 1 } },
          ],
        },
      ],
    });

    expect(btn.type).toBe('DropdownButton');
    expect(btn.iconUrl).toBe('icon:lucide:bar-chart:#fff');
    expect(btn.action).toBeUndefined();
    expect(btn.options).toHaveLength(1);
    expect(btn.options?.[0]).toEqual({
      tooltip: 'Open A',
      iconUrl: 'icon:lucide:file:#fff',
      action: { id: 'open-a', customData: { v: 1 } },
    });
  });

  it('maps nested options to nested dropdowns (recursive)', () => {
    const [btn] = convert({
      version: 1,
      updatedAt: '',
      buttons: [
        {
          type: 'DropdownButton',
          id: 'd1',
          tooltip: 'Top',
          iconUrl: '',
          options: [
            {
              id: 'sub',
              tooltip: 'More',
              iconId: 'lucide:folder',
              options: [{ id: 'leaf', tooltip: 'Leaf', actionId: 'do-leaf' }],
            },
          ],
        },
      ],
    });

    const sub = btn.options?.[0];
    expect(sub?.options).toHaveLength(1);
    expect(sub?.action).toBeUndefined(); // sub-folder, not a leaf
    expect(sub?.options?.[0]).toEqual({ tooltip: 'Leaf', action: { id: 'do-leaf', customData: undefined } });
  });

  it('resolves top-level (dock-bar) button icons for the requested theme', () => {
    const cfg: DockEditorConfig = {
      version: 1,
      updatedAt: '',
      buttons: [
        { type: 'ActionButton', id: 'a', tooltip: 'A', iconUrl: '', iconId: 'lucide:x', actionId: 'go' },
      ],
    };
    expect(convert(cfg, 'dark')[0].iconUrl).toBe('icon:lucide:x:#fff');
    expect(convert(cfg, 'light')[0].iconUrl).toBe('icon:lucide:x:#000');
  });

  it('always resolves submenu option icons to the dark (white) glyph, even in light theme', () => {
    // The classic dock dropdown flyout is always dark, so option glyphs must
    // not follow the theme — otherwise they vanish on the dark flyout in light.
    const cfg: DockEditorConfig = {
      version: 1,
      updatedAt: '',
      buttons: [
        {
          type: 'DropdownButton',
          id: 'd',
          tooltip: 'D',
          iconUrl: '',
          iconId: 'lucide:bar', // top-level button icon — follows theme
          options: [
            {
              id: 'sub',
              tooltip: 'Sub',
              iconId: 'lucide:folder',
              options: [{ id: 'leaf', tooltip: 'Leaf', iconId: 'lucide:file', actionId: 'go' }],
            },
          ],
        },
      ],
    };
    const lightBtn = convert(cfg, 'light')[0];
    // Top-level dropdown button icon follows the light theme...
    expect(lightBtn.iconUrl).toBe('icon:lucide:bar:#000');
    // ...but the nested option + leaf icons stay dark (white) regardless.
    const sub = lightBtn.options?.[0];
    expect(sub?.iconUrl).toBe('icon:lucide:folder:#fff');
    expect(sub?.options?.[0].iconUrl).toBe('icon:lucide:file:#fff');
  });
});
