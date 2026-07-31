/**
 * Dock-bar favorites: top-level DropdownButtons render as icon-bearing
 * folders.
 *
 * OpenFin's `ContentMenuEntry` folder shape has no `icon` field, so a
 * top-level dropdown can never show its icon inside the content-menu
 * dropdown. The dock-bar `DockEntry` folder shape DOES support `icon?`,
 * so `toDock3Favorites` emits each DropdownButton as a folder there
 * (icon + empty children), linked by id to its content-menu copy which
 * owns the children. These tests lock in that contract.
 */

import { describe, it, expect } from 'vitest';
import {
  toDock3Favorites,
  type DockEditorConfig,
  type Dock3FolderEntry,
  type Dock3ItemEntry,
} from './dockConfigTypes';

const generateIcon = (iconId: string, color: string): string => `icon:${iconId}:${color}`;
const recolorUrl = (url: string, color: string): string => `${url}?c=${color}`;
const DARK = '#fff';
const LIGHT = '#000';

function convert(config: DockEditorConfig) {
  return toDock3Favorites(config, generateIcon, recolorUrl, DARK, LIGHT);
}

describe('toDock3Favorites — dock-bar folders for dropdowns', () => {
  it('emits a DropdownButton as a folder with a theme-aware icon and empty children', () => {
    const [entry] = convert({
      version: 1,
      updatedAt: '',
      buttons: [
        {
          type: 'DropdownButton',
          id: 'muni-pnl',
          tooltip: 'Muni PnL',
          iconUrl: '',
          iconId: 'lucide:bar-chart',
          options: [{ id: 'a', tooltip: 'Alpha', actionId: 'act-a' }],
        },
      ],
    });

    const folder = entry as Dock3FolderEntry;
    expect(folder.type).toBe('folder');
    // Same id as the content-menu folder so OpenFin links them.
    expect(folder.id).toBe('muni-pnl');
    expect(folder.icon).toEqual({
      dark: 'icon:lucide:bar-chart:#fff',
      light: 'icon:lucide:bar-chart:#000',
    });
    // Children live in the content-menu copy, not on the favorites folder.
    expect(folder.children).toEqual([]);
  });

  it('still emits an ActionButton as an item with its action', () => {
    const [entry] = convert({
      version: 1,
      updatedAt: '',
      buttons: [
        {
          type: 'ActionButton',
          id: 'launch-x',
          tooltip: 'Launch X',
          iconUrl: '',
          iconId: 'lucide:rocket',
          actionId: 'launch-app',
          customData: { appId: 'x' },
        },
      ],
    });

    const item = entry as Dock3ItemEntry;
    expect(item.type).toBe('item');
    expect(item.id).toBe('launch-x');
    expect(item.itemData).toEqual({ actionId: 'launch-app', customData: { appId: 'x' } });
  });

  it('preserves dock-bar order across mixed button kinds', () => {
    const entries = convert({
      version: 1,
      updatedAt: '',
      buttons: [
        { type: 'ActionButton', id: 'a1', tooltip: 'A1', iconUrl: '', actionId: 'go' },
        { type: 'DropdownButton', id: 'd1', tooltip: 'D1', iconUrl: '', options: [] },
        { type: 'ActionButton', id: 'a2', tooltip: 'A2', iconUrl: '', actionId: 'go' },
      ],
    });

    expect(entries.map((e) => [e.id, e.type])).toEqual([
      ['a1', 'item'],
      ['d1', 'folder'],
      ['a2', 'item'],
    ]);
  });
});
