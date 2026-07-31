import { test, expect, type Page } from '@playwright/test';
import { clickSettingsFromToolbar } from './helpers/settingsSheet';

/**
 * E2E for the settings-sheet pop-out button. Playwright blocks real
 * popups by default, so we stub `window.open` in the page context
 * with a synthetic iframe-backed window — the test then verifies
 * that:
 *   - the button exists in the sheet header
 *   - clicking it calls window.open with the expected name + features
 *   - the main-window sheet flips to data-popped="true"
 *   - the sheet DOM actually renders INSIDE the popout window's body
 *     (proves the React portal is mounted there)
 *   - closing the popout via the OS close button unwinds the portal
 */

const V2_PATH = '/';

async function waitForGrid(page: Page) {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
}

async function stubWindowOpen(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __popoutCalls: unknown[] }).__popoutCalls = [];
    const origOpen = window.open.bind(window);
    window.open = ((url?: string, name?: string, features?: string) => {
      (window as unknown as { __popoutCalls: { url?: string; name?: string; features?: string }[] }).__popoutCalls.push({
        url, name, features,
      });
      // Real browsers reuse an existing window with the same name —
      // the stub must do the same, otherwise StrictMode's double-
      // invoke creates two iframes and the first one (emptied when
      // its React cleanup ran) masks the real one in queries.
      const key = name ?? '__anon__';
      const existing = document.querySelector(`iframe[data-popout-iframe="${key}"]`) as HTMLIFrameElement | null;
      if (existing) return existing.contentWindow as Window;
      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-popout-iframe', key);
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:400px;height:300px;z-index:99999;';
      document.body.appendChild(iframe);
      return iframe.contentWindow as Window;
    }) as typeof origOpen;
  });
}

test.describe('v2 — settings sheet pop-out window', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(V2_PATH);
    await waitForGrid(page);
    await stubWindowOpen(page);
    await clickSettingsFromToolbar(page);
  });

  test('pop-out button is present in the sheet header', async ({ page }) => {
    const btn = page.locator('[data-testid="v2-settings-popout-btn"]');
    await expect(btn).toBeVisible();
  });

  test('clicking pop-out opens a named window with the expected features', async ({ page }) => {
    await page.locator('[data-testid="v2-settings-popout-btn"]').click();
    await page.waitForTimeout(300);

    const calls = await page.evaluate(
      () => (window as unknown as { __popoutCalls: unknown[] }).__popoutCalls,
    );
    expect(Array.isArray(calls) && calls.length).toBeGreaterThanOrEqual(1);
    const firstCall = (calls as { name: string; features: string }[])[0];
    expect(firstCall.name).toMatch(/^ds-popout-/);
    expect(firstCall.features).toMatch(/width=960/);
    expect(firstCall.features).toMatch(/height=700/);
  });

  test('sheet flips to data-popped=true and renders inside the popout window', async ({ page }) => {
    await page.locator('[data-testid="v2-settings-popout-btn"]').click();

    // With the Poppable refactor, the ENTIRE sheet subtree (including
    // the `data-testid="v2-settings-sheet"` wrapper) lives inside the
    // popout — main should contain NONE of it. The popout's copy is
    // the one that carries `data-popped="true"`.
    await expect(page.locator('[data-testid="v2-settings-sheet"]')).toHaveCount(0);

    // Poll the iframe stub for the portal-mounted subtree. React's
    // effect chain (open window → setPopout → mount node memo →
    // createPortal render) takes a few microtasks; the poll keeps
    // the assertion flake-free under CI load without a fixed sleep.
    await expect.poll(async () => {
      return page.evaluate(() => {
        const iframe = document.querySelector('iframe[data-popout-iframe]') as HTMLIFrameElement | null;
        const doc = iframe?.contentDocument;
        const sheetWrapper = doc?.querySelector('[data-testid="v2-settings-sheet"]');
        return {
          hasSheet: !!doc?.querySelector('.ds-sheet'),
          hasPoppedClass: !!doc?.querySelector('.ds-popout.is-popped'),
          hasMountNode: !!doc?.querySelector('[data-popout-root]'),
          sheetPoppedAttr: sheetWrapper?.getAttribute('data-popped') ?? null,
          stylesCloned: doc?.head?.querySelectorAll('style, link[rel="stylesheet"]').length ?? 0,
        };
      });
    }, { timeout: 3000 }).toEqual({
      hasSheet: true,
      hasPoppedClass: true,
      hasMountNode: true,
      sheetPoppedAttr: 'true',
      stylesCloned: expect.any(Number),
    });

    // Finally, the cockpit stylesheet + Tailwind + font imports should
    // all be cloned — at least a handful of stylesheet nodes.
    const stylesCloned = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe]') as HTMLIFrameElement | null;
      return iframe?.contentDocument?.head?.querySelectorAll('style, link[rel="stylesheet"]').length ?? 0;
    });
    expect(stylesCloned).toBeGreaterThanOrEqual(3);
  });

  test('backdrop is suppressed while popped (no overlay blocking the grid)', async ({ page }) => {
    await page.locator('[data-testid="v2-settings-popout-btn"]').click();
    await page.waitForTimeout(300);

    // The backdrop div is part of the inline render branch; when
    // popped=true it should NOT be in the DOM, so the grid
    // underneath stays fully interactive.
    const backdropCount = await page.locator('[data-testid="v2-settings-overlay"]').count();
    expect(backdropCount).toBe(0);
  });

  test('re-clicking the settings icon while popped focuses the popout window (no second window, no inline re-open)', async ({ page }) => {
    // Instrument the iframe stub's contentWindow so we can tell when
    // `focus()` is called on it — a popout buried behind other OS
    // windows should come to front on settings-icon re-click.
    await page.evaluate(() => {
      (window as unknown as { __focusCalls: number }).__focusCalls = 0;
    });
    await page.locator('[data-testid="v2-settings-popout-btn"]').click();
    await page.waitForTimeout(400);

    // Patch the popout iframe's contentWindow.focus so the counter
    // bumps on each call. We do this AFTER the popout is opened so
    // we only measure the user-initiated re-click, not the portal
    // itself.
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe]') as HTMLIFrameElement | null;
      const win = iframe?.contentWindow as unknown as { focus: () => void } | null;
      if (!win) return;
      const orig = win.focus?.bind(win) ?? (() => {});
      win.focus = () => {
        (window as unknown as { __focusCalls: number }).__focusCalls += 1;
        orig();
      };
    });

    // Re-click the settings icon — should raise the popout.
    await clickSettingsFromToolbar(page);
    await page.waitForTimeout(200);

    const focusCalls = await page.evaluate(
      () => (window as unknown as { __focusCalls: number }).__focusCalls,
    );
    expect(focusCalls).toBeGreaterThanOrEqual(1);

    // And no second popout iframe was opened + the sheet did NOT
    // re-mount inline (there's no backdrop in the main doc).
    const iframeCount = await page.locator('iframe[data-popout-iframe]').count();
    expect(iframeCount).toBe(1);
    const backdropCount = await page.locator('[data-testid="v2-settings-overlay"]').count();
    expect(backdropCount).toBe(0);
  });

  test('popout window title is suffixed with the grid\'s gridId', async ({ page }) => {
    // Users with multiple grids (e.g. the two-grid dashboard) need to
    // tell popout windows apart in the OS taskbar — the window title
    // must include the originating grid's id. `demo-blotter-v2` is
    // the single-grid demo's configured gridId.
    await page.locator('[data-testid="v2-settings-popout-btn"]').click();
    await page.waitForTimeout(400);

    const title = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe]') as HTMLIFrameElement | null;
      return iframe?.contentDocument?.title ?? '';
    });
    expect(title).toContain('Grid Customizer');
    expect(title).toContain('demo-blotter-v2');
  });

  test('module menubar from the popped sheet renders INSIDE the popout window', async ({ page }) => {
    await page.locator('[data-testid="v2-settings-popout-btn"]').click();
    await page.waitForTimeout(400);

    // Module items live inside portaled menus (closed by default), so the
    // in-DOM markers are the menubar bar + its group triggers.
    const where = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe]') as HTMLIFrameElement | null;
      const popoutDoc = iframe?.contentDocument;
      return {
        menubarInMain: document.querySelectorAll('[data-testid="v2-settings-module-menubar"]').length,
        menubarInPopout: popoutDoc?.querySelectorAll('[data-testid="v2-settings-module-menubar"]').length ?? 0,
        groupsInMain: document.querySelectorAll('[data-testid^="v2-settings-nav-group-"]').length,
        groupsInPopout: popoutDoc?.querySelectorAll('[data-testid^="v2-settings-nav-group-"]').length ?? 0,
      };
    });

    expect(where.menubarInMain).toBe(0);
    expect(where.menubarInPopout).toBeGreaterThanOrEqual(1);
    expect(where.groupsInMain).toBe(0);
    expect(where.groupsInPopout).toBeGreaterThanOrEqual(1);
  });

  test('pop-out + close buttons AND the title caption hide while popped', async ({ page }) => {
    await page.locator('[data-testid="v2-settings-popout-btn"]').click();
    await page.waitForTimeout(300);

    // Header cluster owned by the OS window chrome once popped: the
    // "GRID CUSTOMIZER / v2.3.0" caption + drag grip + close X. The
    // pop-out button is ALSO hidden (redundant inside an OS window).
    // The MAIN doc shouldn't render any of them.
    const mainDocHasChrome = await page.evaluate(() => {
      return {
        close: !!document.querySelector('[data-testid="v2-settings-close-btn"]'),
        popoutBtn: !!document.querySelector('[data-testid="v2-settings-popout-btn"]'),
        titleText: !!document.querySelector('.ds-popout-title-text'),
        titleSub: !!document.querySelector('.ds-popout-title-sub'),
      };
    });
    expect(mainDocHasChrome).toEqual({
      close: false,
      popoutBtn: false,
      titleText: false,
      titleSub: false,
    });

    // And INSIDE the popout window, those same header pieces are also
    // hidden — the OS window's own title bar + close button own them.
    const popoutDocHasChrome = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe]') as HTMLIFrameElement | null;
      const doc = iframe?.contentDocument;
      return {
        close: !!doc?.querySelector('[data-testid="v2-settings-close-btn"]'),
        popoutBtn: !!doc?.querySelector('[data-testid="v2-settings-popout-btn"]'),
        titleText: !!doc?.querySelector('.ds-popout-title-text'),
        titleSub: !!doc?.querySelector('.ds-popout-title-sub'),
      };
    });
    expect(popoutDocHasChrome).toEqual({
      close: false,
      popoutBtn: false,
      titleText: false,
      titleSub: false,
    });
  });
});
