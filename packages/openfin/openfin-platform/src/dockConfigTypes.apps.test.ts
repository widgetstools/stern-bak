import { describe, expect, it } from 'vitest';
import {
  appsToEditorConfig,
  makeDualIcon,
  toDock3UserContentMenu,
  type DockEditorConfig,
} from './dockConfigTypes.js';

const generateIcon = (iconId: string, color: string): string => `icon:${iconId}:${color}`;
const recolorUrl = (url: string, color: string): string => `${url}?c=${color}`;

describe('makeDualIcon', () => {
  it('uses a fixed iconColor for both themes when set', () => {
    expect(
      makeDualIcon(
        { iconId: 'lucide:home', iconColor: '#abc' },
        generateIcon,
        recolorUrl,
        '#fff',
        '#000',
      ),
    ).toBe('icon:lucide:home:#abc');
  });

  it('falls back to iconUrl when iconColor is set without iconId', () => {
    expect(
      makeDualIcon(
        { iconUrl: 'http://x/i.svg', iconColor: '#abc' },
        generateIcon,
        recolorUrl,
        '#fff',
        '#000',
      ),
    ).toBe('http://x/i.svg');
  });

  it('returns themed URLs for iconId without fixed color', () => {
    expect(
      makeDualIcon({ iconId: 'mkt:bond' }, generateIcon, recolorUrl, '#fff', '#000'),
    ).toEqual({ dark: 'icon:mkt:bond:#fff', light: 'icon:mkt:bond:#000' });
  });

  it('collapses identical recolored URLs to a string', () => {
    const same = (_u: string, _c: string) => 'same.svg';
    expect(
      makeDualIcon({ iconUrl: 'http://x/i.svg' }, generateIcon, same, '#fff', '#000'),
    ).toBe('same.svg');
  });

  it('returns empty string when nothing is set', () => {
    expect(makeDualIcon({}, generateIcon, recolorUrl, '#fff', '#000')).toBe('');
  });
});

describe('toDock3UserContentMenu', () => {
  it('emits only DropdownButtons as folders with nested children', () => {
    const config: DockEditorConfig = {
      version: 1,
      updatedAt: '',
      buttons: [
        {
          type: 'ActionButton',
          id: 'skip',
          tooltip: 'Skip',
          iconUrl: '',
          actionId: 'launch-app',
        },
        {
          type: 'DropdownButton',
          id: 'apps',
          tooltip: 'Apps',
          iconUrl: '',
          options: [
            {
              id: 'leaf',
              tooltip: 'Leaf',
              actionId: 'launch-app',
              iconId: 'lucide:file',
            },
            {
              id: 'folder',
              tooltip: 'Folder',
              options: [{ id: 'nested', tooltip: 'Nested', actionId: 'act' }],
            },
          ],
        },
      ],
    };
    const menu = toDock3UserContentMenu(config, generateIcon, recolorUrl, '#fff', '#000');
    expect(menu).toHaveLength(1);
    expect(menu[0]).toMatchObject({ type: 'folder', id: 'apps', label: 'Apps' });
    const children = (menu[0] as { children: unknown[] }).children;
    expect(children).toHaveLength(2);
    expect(children[0]).toMatchObject({ type: 'item', id: 'leaf' });
    expect(children[1]).toMatchObject({ type: 'folder', id: 'folder' });
  });
});

describe('appsToEditorConfig', () => {
  it('emits ActionButtons when there are at most 6 apps', () => {
    const apps = Array.from({ length: 3 }, (_, i) => ({
      appId: `a${i}`,
      title: `App ${i}`,
      icons: [{ src: `i${i}.svg` }],
    }));
    const cfg = appsToEditorConfig(apps, 'fallback.svg');
    expect(cfg.buttons).toHaveLength(3);
    expect(cfg.buttons.every((b) => b.type === 'ActionButton')).toBe(true);
    expect(cfg.buttons[0]).toMatchObject({
      actionId: 'launch-app',
      iconUrl: 'i0.svg',
    });
  });

  it('groups more than 6 apps into a single Apps dropdown', () => {
    const apps = Array.from({ length: 7 }, (_, i) => ({
      appId: `a${i}`,
      title: `App ${i}`,
    }));
    const cfg = appsToEditorConfig(apps, 'fallback.svg');
    expect(cfg.buttons).toHaveLength(1);
    expect(cfg.buttons[0]).toMatchObject({
      type: 'DropdownButton',
      id: 'apps',
      tooltip: 'Apps',
      iconUrl: 'fallback.svg',
    });
    expect((cfg.buttons[0] as { options: unknown[] }).options).toHaveLength(7);
  });
});
