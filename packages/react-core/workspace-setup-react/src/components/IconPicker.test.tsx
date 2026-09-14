import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ICON_META } from '@wellsfargo-starui/design-system/icons';
import { IconPicker } from './IconPicker.js';

/**
 * IconPicker emits an iconId plus a resolved URL. Both matter: callers
 * persist the id and some snapshot the URL into a dock-config field, so a
 * wrong URL shows up as a broken glyph in the dock rather than as a visible
 * test failure. Every URL is a self-contained data URL — the dock renders
 * offline, and the Iconify CDN is unreachable on a locked-down desktop.
 */

/**
 * Paste rather than type: a per-character `userEvent.type` costs a render
 * per keystroke on a loaded machine. The filter is a pure function of the
 * final value, so a single change event exercises it exactly the same.
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
  it('lists the market icon catalog, each icon once', () => {
    render(<IconPicker onSelect={vi.fn()} />);

    // One catalog: the curated list plus the rest of the market set,
    // de-duplicated by id — a duplicate key used to leave stale cells in
    // the grid after a search (WORKLOG item 7).
    expect(screen.getAllByRole('button', { name: ICON_META.bond.name })).toHaveLength(1);
  });

  it('emits a self-contained data URL for a market icon', async () => {
    const onSelect = vi.fn();
    render(<IconPicker onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bond' }));

    const [iconId, url] = onSelect.mock.calls[0];
    expect(iconId).toBe('mkt:bond');
    expect(url.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('emits a self-contained data URL carrying the requested colour for a lucide icon', async () => {
    const onSelect = vi.fn();
    render(<IconPicker onSelect={onSelect} color="#ff0000" />);

    await userEvent.click(screen.getByRole('button', { name: 'FileText' }));

    const [iconId, url] = onSelect.mock.calls[0];
    expect(iconId).toBe('lucide:file-text');
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const svg = Buffer.from(url.split(',')[1], 'base64').toString('utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('#ff0000');
    expect(svg).not.toContain('currentColor');
  });

  it('defaults the colour to the design-system text token', async () => {
    const onSelect = vi.fn();
    render(<IconPicker onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'FileText' }));

    const svg = Buffer.from(onSelect.mock.calls[0][1].split(',')[1], 'base64').toString('utf8');
    expect(svg).toContain('var(--ds-text-primary)');
  });

  it('surfaces a match for a case-insensitive search', async () => {
    render(<IconPicker onSelect={vi.fn()} />);

    await search('FILETEXT');

    expect(screen.getByRole('button', { name: 'FileText' })).toBeDefined();
  });

  it('leaves only the matching icons on screen after a search', async () => {
    render(<IconPicker onSelect={vi.fn()} />);

    await search('FileText');

    expect(screen.getByRole('button', { name: 'FileText' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Bond' })).toBeNull();
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

    const cell = screen.getByRole('button', { name: 'FileText' });
    expect(cell.className).toContain('border-primary');
    expect(cell.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the curated system icons selectable', () => {
    // ICON_META.wrench is category 'system' and is not added from the
    // market pass; the curated list names `mkt:wrench` explicitly.
    expect(ICON_META.wrench.category).toBe('system');
    render(<IconPicker onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: ICON_META.wrench.name })).toBeDefined();
  });
});
