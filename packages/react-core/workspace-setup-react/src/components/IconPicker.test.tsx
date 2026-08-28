import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ICON_META } from '@wellsfargo-starui/design-system/icons';
import { IconPicker } from './IconPicker.js';

/**
 * IconPicker emits an iconId plus a resolved URL. Both matter: callers
 * persist the id and some snapshot the URL into a dock-config field, so a
 * wrong URL shows up as a broken glyph in the dock rather than as a visible
 * test failure.
 *
 * The grid is windowed, so an icon outside the visible rows is genuinely not
 * in the DOM — reach one the way a user does, by searching for it first.
 */

/**
 * Paste rather than type: a per-character `userEvent.type` fires one change
 * per keystroke, which is slow on a loaded machine. The filter is a pure
 * function of the final value, so a single change exercises it identically.
 */
async function search(text: string) {
  await userEvent.click(screen.getByPlaceholderText('Search icons…'));
  await userEvent.paste(text);
}

/** ScrollArea (radix) measures its viewport on mount. */
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('IconPicker', () => {
  it('lists the market icon catalog', () => {
    render(<IconPicker onSelect={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: ICON_META.bond.name }).length).toBeGreaterThan(0);
  });

  it('emits a self-contained data URL for a market icon', async () => {
    const onSelect = vi.fn();
    render(<IconPicker onSelect={onSelect} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Bond' })[0]);

    const [iconId, url] = onSelect.mock.calls[0];
    expect(iconId).toBe('mkt:bond');
    // Market icons must not depend on a CDN — the dock renders offline.
    expect(url.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('emits an Iconify CDN URL carrying the requested colour for a lucide icon', async () => {
    const onSelect = vi.fn();
    render(<IconPicker onSelect={onSelect} color="#ff0000" />);

    await search('FileText');
    await userEvent.click(screen.getByRole('button', { name: 'FileText' }));

    expect(onSelect).toHaveBeenCalledWith(
      'lucide:file-text',
      `https://api.iconify.design/lucide/file-text.svg?color=${encodeURIComponent('#ff0000')}&height=24`,
    );
  });

  it('defaults the colour to the design-system text token', async () => {
    const onSelect = vi.fn();
    render(<IconPicker onSelect={onSelect} />);

    await search('FileText');
    await userEvent.click(screen.getByRole('button', { name: 'FileText' }));

    expect(onSelect.mock.calls[0][1]).toContain(encodeURIComponent('var(--ds-text-primary)'));
  });

  it('surfaces a match for a case-insensitive search', async () => {
    render(<IconPicker onSelect={vi.fn()} />);

    await search('FILETEXT');

    expect(screen.getByRole('button', { name: 'FileText' })).toBeDefined();
  });

  it('shows an empty state when nothing matches', async () => {
    render(<IconPicker onSelect={vi.fn()} />);

    await search('zzzznotanicon');

    expect(screen.getByText(/No icons match/)).toBeDefined();
  });

  it('treats a whitespace-only search as no search', async () => {
    render(<IconPicker onSelect={vi.fn()} />);

    await search('filetext');
    await userEvent.clear(screen.getByPlaceholderText('Search icons…'));
    await search('   ');

    expect(screen.getAllByRole('button', { name: 'Bond' }).length).toBeGreaterThan(0);
  });

  it('marks the currently selected icon', async () => {
    render(<IconPicker onSelect={vi.fn()} selectedIcon="lucide:file-text" />);

    await search('FileText');
    // aria-pressed rather than a class name: it is what a screen reader
    // conveys, and it survives restyling.
    expect(screen.getByRole('button', { name: 'FileText' }).getAttribute('aria-pressed')).toBe('true');
  });
});

/**
 * WORKLOG item 7a, now fixed — these four were pinned as known-wrong and are
 * flipped here, which is what that entry said a fix should do.
 *
 * `buildIconList` used to concatenate ICON_META (tagged `market`) with
 * ICON_OPTIONS (tagged `lucide` **wholesale**), but 80 of ICON_OPTIONS' 140
 * entries carry `mkt:*` ids, so 72 icons were listed twice and mis-tagged.
 * `source` is now derived from the id's own prefix and the catalogue is keyed
 * by id, so neither can recur.
 */
describe('IconPicker — catalogue integrity (WORKLOG item 7a)', () => {
  it('lists each market icon exactly once', () => {
    render(<IconPicker onSelect={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: 'Bond' })).toHaveLength(1);
  });

  /** The duplicate used to take the lucide branch and emit
   *  https://api.iconify.design/mkt/bond.svg, which does not exist — persisted
   *  into a dock config, that is a permanently blank button. */
  it('emits an inline data URL for a market icon, never a CDN path', async () => {
    const onSelect = vi.fn();
    render(<IconPicker onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bond' }));

    expect(onSelect.mock.calls[0][0]).toBe('mkt:bond');
    expect(onSelect.mock.calls[0][1]).toMatch(/^data:/);
    expect(onSelect.mock.calls[0][1]).not.toContain('api.iconify.design');
  });

  /** The user-visible one: duplicate keys stopped React reconciling the
   *  filtered grid, so a search left ~72 non-matching icons on screen. */
  it('removes non-matching icons on search', async () => {
    render(<IconPicker onSelect={vi.fn()} />);

    await search('FileText');

    expect(screen.getByRole('button', { name: 'FileText' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Bond' })).toBeNull();
  });

  it('keeps system-category icons out of the picker', () => {
    expect(ICON_META.wrench.category).toBe('system');
    render(<IconPicker onSelect={vi.fn()} />);

    expect(screen.queryByRole('button', { name: ICON_META.wrench.name })).toBeNull();
  });
});
