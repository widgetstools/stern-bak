import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_OPTIONS,
  DEFAULT_WINDOW_OPTIONS,
  createMenuItem,
  type DockMenuItem,
} from './dockConfig.js';

describe('createMenuItem', () => {
  it('fills every required field when called with no argument', () => {
    const item = createMenuItem();
    expect(item.caption).toBe('New Menu Item');
    expect(item.url).toBe('');
    expect(item.openMode).toBe('view');
    expect(item.children).toEqual([]);
    expect(item.order).toBe(0);
    expect(item.metadata).toEqual({});
    expect(item.id).toMatch(/^menu-item-\d+-[a-z0-9]+$/);
  });

  it('generates a distinct id per call — dock items are keyed by id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createMenuItem().id));
    expect(ids.size).toBe(50);
  });

  it('takes the caller\'s values over the defaults', () => {
    const child = createMenuItem({ id: 'child' });
    const item = createMenuItem({
      id: 'apps',
      caption: 'Applications',
      url: 'https://example/app',
      openMode: 'window',
      icon: 'grid',
      children: [child],
      order: 3,
      metadata: { group: 'markets' },
    });
    expect(item).toMatchObject({
      id: 'apps',
      caption: 'Applications',
      url: 'https://example/app',
      openMode: 'window',
      icon: 'grid',
      order: 3,
      metadata: { group: 'markets' },
    });
    expect(item.children).toEqual([child]);
  });

  it('gives each item its OWN options, so resizing one cannot resize the rest', () => {
    const a = createMenuItem();
    const b = createMenuItem();
    expect(a.windowOptions).toEqual(DEFAULT_WINDOW_OPTIONS);
    expect(a.windowOptions).not.toBe(DEFAULT_WINDOW_OPTIONS);
    expect(a.windowOptions).not.toBe(b.windowOptions);
    expect(a.viewOptions).not.toBe(b.viewOptions);

    // The dock-editor write that used to reach every other item.
    a.windowOptions!.width = 900;
    expect(b.windowOptions!.width).toBe(DEFAULT_WINDOW_OPTIONS.width);
    expect(createMenuItem().windowOptions!.width).toBe(DEFAULT_WINDOW_OPTIONS.width);
  });

  it('keeps caller-supplied window/view options instead of the defaults', () => {
    const windowOptions: DockMenuItem['windowOptions'] = { width: 400, height: 300 };
    const viewOptions: DockMenuItem['viewOptions'] = { bounds: { width: 100 } };
    const item = createMenuItem({ windowOptions, viewOptions });
    expect(item.windowOptions).toBe(windowOptions);
    expect(item.viewOptions).toBe(viewOptions);
  });

  it('falls back to defaults for falsy-but-supplied values', () => {
    // `||` (not `??`) is used throughout the factory, so an explicit
    // empty caption or order 0 collapses to the default. Pinned because
    // the dock editor round-trips items through this factory and a user
    // clearing a caption must not silently keep the old text.
    const item = createMenuItem({ caption: '', order: 0, url: '' });
    expect(item.caption).toBe('New Menu Item');
    expect(item.order).toBe(0);
    expect(item.url).toBe('');
  });
});

describe('DEFAULT_WINDOW_OPTIONS / DEFAULT_VIEW_OPTIONS', () => {
  it('describes a resizable, framed 1200x800 window with accelerators on', () => {
    expect(DEFAULT_WINDOW_OPTIONS).toEqual({
      width: 1200,
      height: 800,
      minWidth: 600,
      minHeight: 400,
      resizable: true,
      maximizable: true,
      minimizable: true,
      center: true,
      frame: true,
      contextMenu: true,
      accelerator: { zoom: true, reload: true, devtools: true },
    });
  });

  it('describes an 800x600 view', () => {
    expect(DEFAULT_VIEW_OPTIONS).toEqual({ bounds: { width: 800, height: 600 } });
  });
});
