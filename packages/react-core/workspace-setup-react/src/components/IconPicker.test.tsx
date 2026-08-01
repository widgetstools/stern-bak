import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ICON_META } from '@wellsfargo-starui/icons-svg';
import { IconPicker } from './IconPicker.js';

/**
 * IconPicker emits an iconId plus a resolved URL. Both matter: callers
 * persist the id and some snapshot the URL into a dock-config field, so a
 * wrong URL shows up as a broken glyph in the dock rather than as a visible
 * test failure.
 *
 * Two tests below pin behaviour that is wrong rather than intended — see the
 * "known-wrong" block and WORKLOG item 7.
 */

/**
 * Paste rather than type: the grid renders 245 buttons, so a per-character
 * `userEvent.type` re-renders all of them once per keystroke and pushes the
 * test past its timeout on a loaded machine. The filter is a pure function of
 * the final value, so a single change event exercises it exactly the same.
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

    await userEvent.click(screen.getByRole('button', { name: 'FileText' }));

    expect(onSelect).toHaveBeenCalledWith(
      'lucide:file-text',
      `https://api.iconify.design/lucide/file-text.svg?color=${encodeURIComponent('#ff0000')}&height=24`,
    );
  });

  it('defaults the colour to the design-system text token', async () => {
    const onSelect = vi.fn();
    render(<IconPicker onSelect={onSelect} />);

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

    expect(screen.getByText('No icons found')).toBeDefined();
  });

  it('treats a whitespace-only search as no search', async () => {
    render(<IconPicker onSelect={vi.fn()} />);

    await search('filetext');
    await userEvent.clear(screen.getByPlaceholderText('Search icons…'));
    await search('   ');

    expect(screen.getAllByRole('button', { name: 'Bond' }).length).toBeGreaterThan(0);
  });

  it('marks the currently selected icon', () => {
    render(<IconPicker onSelect={vi.fn()} selectedIcon="lucide:file-text" />);

    expect(screen.getByRole('button', { name: 'FileText' }).className).toContain('border-primary');
  });
});

describe('IconPicker — known-wrong behaviour, pinned (WORKLOG item 7)', () => {
  /**
   * `buildIconList` concatenates ICON_META (tagged source 'market') with
   * ICON_OPTIONS (tagged source 'lucide' wholesale). But 80 of ICON_OPTIONS'
   * 140 entries carry `mkt:*` ids, so every one of them is mis-tagged. The
   * consequences are asserted below so a fix flips these tests rather than
   * landing silently.
   */

  it('lists each market icon twice, with a duplicate React key', () => {
    render(<IconPicker onSelect={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: 'Bond' })).toHaveLength(2);
  });

  it('the duplicate emits an unreachable CDN URL for a market icon', async () => {
    const onSelect = vi.fn();
    render(<IconPicker onSelect={onSelect} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Bond' })[1]);

    // https://api.iconify.design/mkt/bond.svg does not exist — persisting it
    // into a dock config yields a permanently blank button icon.
    expect(onSelect.mock.calls[0][1]).toContain('api.iconify.design/mkt/bond.svg');
  });

  it('leaves non-matching icons on screen after a search', async () => {
    // The worst consequence of the duplicate ids: `key={icon.id}` is
    // non-unique, so React cannot reconcile the filtered grid and keeps
    // dozens of icons that no longer match. Searching "FileText" should
    // leave one button; it leaves the whole duplicated market block too.
    render(<IconPicker onSelect={vi.fn()} />);

    await search('FileText');

    expect(screen.getByRole('button', { name: 'FileText' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Bond' })).not.toBeNull();
  });

  it('system-category icons stay selectable despite the explicit skip', () => {
    // ICON_META.wrench is category 'system' and is filtered out of the market
    // pass, but ICON_OPTIONS reintroduces `mkt:wrench` through the lucide pass.
    expect(ICON_META.wrench.category).toBe('system');
    render(<IconPicker onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: ICON_META.wrench.name })).toBeDefined();
  });
});
