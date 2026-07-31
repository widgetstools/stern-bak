/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { subscribeWindowOptions } from './windowOptionsSubscription.js';

/**
 * Source-of-truth field path for tab visibility (live OpenFin
 * investigation pending — record the exact path as a comment here once
 * verified inside the reference workspace browser):
 *
 *   const opts = await (await fin.me.getCurrentWindow()).getOptions();
 *
 * Two shapes are observed across OpenFin Workspace versions, so
 * `deriveTabsHidden` checks both:
 *   - opts.workspacePlatform.windowOptions.toolbarOptions.visible
 *     (boolean; tabsHidden = !visible)
 *   - opts.workspacePlatform.viewTabsVisible
 *     (boolean; tabsHidden = !viewTabsVisible)
 *
 * Whichever the runtime exposes wins; if neither is present we fall
 * back to `false` (tabs visible) to match the browser default.
 */
export function deriveTabsHidden(opts: unknown): boolean {
  if (!opts || typeof opts !== 'object') return false;
  const wp = (opts as any).workspacePlatform;
  if (!wp || typeof wp !== 'object') return false;

  // Top-level shapes (older / browser-window flavors).
  const toolbarVisible = wp.toolbarOptions?.visible;
  if (typeof toolbarVisible === 'boolean') return !toolbarVisible;

  const viewTabsVisible = wp.viewTabsVisible;
  if (typeof viewTabsVisible === 'boolean') return !viewTabsVisible;

  // Page-scoped shapes (current Workspace runtime). The active page's
  // layout / toolbar config carries the visibility flag. We also fall
  // back to the first page if no `isActive` is set.
  const pages = Array.isArray(wp.pages) ? wp.pages : null;
  if (pages && pages.length > 0) {
    const activePage = pages.find((p: any) => p?.isActive) ?? pages[0];
    if (activePage && typeof activePage === 'object') {
      const pageToolbarVisible = activePage.toolbarOptions?.visible;
      if (typeof pageToolbarVisible === 'boolean') return !pageToolbarVisible;

      const pageViewTabsVisible = activePage.viewTabsVisible;
      if (typeof pageViewTabsVisible === 'boolean') return !pageViewTabsVisible;

      // Some runtimes nest the flag under layout settings.
      const layoutToolbarVisible = activePage.layout?.toolbarOptions?.visible;
      if (typeof layoutToolbarVisible === 'boolean') return !layoutToolbarVisible;

      const layoutViewTabsVisible = activePage.layout?.viewTabsVisible;
      if (typeof layoutViewTabsVisible === 'boolean') return !layoutViewTabsVisible;

      // Workspace `settings.viewTabsVisible` is another common path.
      const settingsViewTabsVisible = activePage.layout?.settings?.viewTabsVisible;
      if (typeof settingsViewTabsVisible === 'boolean') return !settingsViewTabsVisible;

      // GoldenLayout-backed Workspace runtime: tab strip = stack headers.
      // `layout.settings.hasHeaders === false` means no tab headers are
      // rendered for any stack on the page → tabs are hidden. This is the
      // path the current Workspace runtime exposes (verified live).
      const hasHeaders = activePage.layout?.settings?.hasHeaders;
      if (typeof hasHeaders === 'boolean') return !hasHeaders;

      // Belt-and-suspenders: a `headerHeight` of 0 also reliably means
      // "no header bar rendered" on GoldenLayout stacks.
      const headerHeight = activePage.layout?.dimensions?.headerHeight;
      if (typeof headerHeight === 'number') return headerHeight === 0;
    }
  }

  return false;
}

/**
 * React state mirror of the parent OpenFin window's tab-strip
 * visibility. Reads the initial value from `window.getOptions()` and
 * stays in sync with the `options-changed` event stream.
 *
 * Outside an OpenFin runtime returns `false` and attaches no listeners.
 * Consumers are expected to render their own caption/header — this hook
 * is a passthrough event source, not a UI component.
 *
 * Internally subscribes via the shared `windowOptionsSubscription`
 * manager so multiple hooks reading window options (e.g. this one and
 * `useColorLinking`) all share a single `options-changed` listener.
 *
 * Initial-value seeding: the OpenFin `options-changed` round-trip is
 * async and can land hundreds of ms after first paint, which causes
 * the caption (gated on `tabsHidden`) to flash in late. To avoid the
 * flicker we cache the last-known value in `sessionStorage` and seed
 * the initial state from it. The cache is per-tab, so a fresh
 * OpenFin window with no prior tabsHidden record still falls through
 * to `false` until the real event lands.
 */
const TABS_HIDDEN_CACHE_KEY = 'marketsui.tabsHidden';

function readCachedTabsHidden(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(TABS_HIDDEN_CACHE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCachedTabsHidden(next: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(TABS_HIDDEN_CACHE_KEY, next ? '1' : '0');
  } catch {
    /* ignore storage errors (private mode, quota) */
  }
}

export function useTabsHidden(): boolean {
  const [tabsHidden, setTabsHidden] = useState<boolean>(readCachedTabsHidden);

  useEffect(() => {
    const unsubscribe = subscribeWindowOptions((opts) => {
      const next = deriveTabsHidden(opts);
      writeCachedTabsHidden(next);
      setTabsHidden(next);
    });
    return unsubscribe;
  }, []);

  return tabsHidden;
}
