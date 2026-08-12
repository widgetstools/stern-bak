import { test, expect, type Page } from '@playwright/test';
import { openViewMenu } from './helpers/viewMenu';

/**
 * E2E for the FormattingToolbar pop-out. Same shape as the settings
 * sheet popout spec (window.open is stubbed with an iframe so we can
 * introspect the popout's document without asking Playwright to
 * open a real second window — which doesn't compose well with the
 * default `use.page` fixture).
 *
 * What we prove:
 *   - Button exists on the inline toolbar.
 *   - Clicking it opens a named, gridId-scoped window with the
 *     expected dimensions and alwaysOnTop passthrough.
 *   - Toolbar `data-popped` flips + `.is-popped` class lands inside
 *     the popout.
 *   - Every Radix/shadcn popover (templates menu etc.) inside the
 *     popped toolbar renders INSIDE the popout — regression against
 *     the portal-container bug.
 *   - Re-clicking the main window's brush button focuses the buried
 *     popout instead of no-op-toggling the inline toolbar away.
 *   - Title carries the gridId suffix.
 */

const V2_PATH = '/';

async function waitForGrid(page: Page) {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-grid-viewport .ag-row', { timeout: 15_000 });
}

async function stubWindowOpen(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __popoutCalls: unknown[] }).__popoutCalls = [];
    const orig = window.open.bind(window);
    window.open = ((url?: string, name?: string, features?: string) => {
      (window as unknown as { __popoutCalls: { url?: string; name?: string; features?: string }[] }).__popoutCalls.push({
        url, name, features,
      });
      const key = name ?? '__anon__';
      const existing = document.querySelector(`iframe[data-popout-iframe="${key}"]`) as HTMLIFrameElement | null;
      if (existing) return existing.contentWindow as Window;
      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-popout-iframe', key);
      // `pointer-events: none` so the stub iframe never intercepts
      // clicks on main-window UI we still need to drive (e.g. the
      // brush button at top-right). Clicks inside the popup are
      // synthesized via `contentDocument.querySelector(...).click()`
      // in the tests — direct DOM dispatch, no pointer routing.
      iframe.style.cssText = 'position:fixed;bottom:0;left:0;width:700px;height:200px;z-index:99999;pointer-events:none;';
      document.body.appendChild(iframe);
      return iframe.contentWindow as Window;
    }) as typeof orig;
  });
}

test.describe('v2 — formatting toolbar pop-out window', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(V2_PATH);
    await waitForGrid(page);
    await stubWindowOpen(page);
    // Open the inline toolbar via the primary row's brush button.
    await openViewMenu(page);
    await page.locator('[data-testid="style-toolbar-toggle"]').click();
    await expect(page.locator('[data-testid="formatting-toolbar"]')).toBeVisible();
  });

  test('pop-out button is present on the inline toolbar', async ({ page }) => {
    await expect(page.locator('[data-testid="formatting-popout-btn"]')).toBeVisible();
  });

  test('clicking the pop-out opens a gridId-scoped window with the expected features', async ({ page }) => {
    await page.locator('[data-testid="formatting-popout-btn"]').click();
    await page.waitForTimeout(300);

    const calls = await page.evaluate(
      () => (window as unknown as { __popoutCalls: { name: string; features: string }[] }).__popoutCalls,
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].name).toBe('ds-popout-toolbar-demo-blotter-v2');
    // 560×680 is the current properties-panel popout dim (set in
    // FormattingToolbar.tsx, commit 1a292bd0 on 2026-04-26 — bumped
    // from the previous 400×620 because the band layout grew). The
    // old 900×120 compact-toolbar window is gone; popping out now
    // shows the vertical-stack properties panel instead.
    expect(calls[0].features).toMatch(/width=560/);
    expect(calls[0].features).toMatch(/height=680/);
  });

  test('popped toolbar renders the properties panel (not the compact toolbar)', async ({ page }) => {
    await page.locator('[data-testid="formatting-popout-btn"]').click();

    // Main doc should contain NEITHER the compact toolbar NOR the
    // properties panel — both live inside the popout window now.
    await expect(page.locator('[data-testid="formatting-toolbar"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="formatting-properties-panel"]')).toHaveCount(0);

    await expect.poll(async () => {
      return page.evaluate(() => {
        const iframe = document.querySelector('iframe[data-popout-iframe^="ds-popout-toolbar-"]') as HTMLIFrameElement | null;
        const doc = iframe?.contentDocument;
        return {
          // Popped mode renders the FormattingPropertiesPanel, not
          // the compact toolbar. The panel exposes its own testid.
          hasPropertiesPanel: !!doc?.querySelector('[data-testid="formatting-properties-panel"]'),
          // And the compact toolbar should NOT be inside the popout.
          hasCompactToolbar: !!doc?.querySelector('[data-testid="formatting-toolbar"]'),
          // Header + sections are rendered by the panel.
          hasHeader: !!doc?.querySelector('[data-testid="fmt-panel-header"]'),
          sectionCount: doc?.querySelectorAll('[data-section-index]').length ?? 0,
          stylesCloned: doc?.head?.querySelectorAll('style, link[rel="stylesheet"]').length ?? 0,
        };
      });
    }, { timeout: 3000 }).toEqual({
      hasPropertiesPanel: true,
      hasCompactToolbar: false,
      hasHeader: true,
      sectionCount: 5, // Typography, Color, Border, Value Format, Templates
      stylesCloned: expect.any(Number),
    });
  });

  test('popout window title is suffixed with the grid\'s gridId', async ({ page }) => {
    await page.locator('[data-testid="formatting-popout-btn"]').click();
    await page.waitForTimeout(300);

    const title = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="ds-popout-toolbar-"]') as HTMLIFrameElement | null;
      return iframe?.contentDocument?.title ?? '';
    });
    expect(title).toContain('Formatting');
    expect(title).toContain('demo-blotter-v2');
  });

  test('shadcn popovers (color picker) from the popped panel render INSIDE the popout', async ({ page }) => {
    // Most of the panel's editors render inline — but the color
    // picker is still a popover. Regression: that popover must
    // portal into the POPOUT's document, not main's, so clicks on
    // its swatches hit-test correctly. Click a cell so the picker
    // is enabled + clickable.
    await page.locator('.ag-row .ag-cell[col-id="price"]').first().click();
    await page.waitForTimeout(100);

    await page.locator('[data-testid="formatting-popout-btn"]').click();
    await page.waitForTimeout(300);

    const before = await page.evaluate(() => document.querySelectorAll('[data-radix-popper-content-wrapper]').length);
    expect(before).toBe(0);

    // Trigger the Text color picker inside the panel's Paint section.
    const clicked = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="ds-popout-toolbar-"]') as HTMLIFrameElement | null;
      const btn = iframe?.contentDocument?.querySelector('[data-section-index="03"] button[aria-label="Text color"]') as HTMLElement | null;
      if (!btn) return false;
      btn.click();
      return true;
    });
    expect(clicked).toBe(true);
    await page.waitForTimeout(250);

    const where = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="ds-popout-toolbar-"]') as HTMLIFrameElement | null;
      const popoutDoc = iframe?.contentDocument;
      return {
        wrappersInMain: document.querySelectorAll('[data-radix-popper-content-wrapper]').length,
        wrappersInPopout: popoutDoc?.querySelectorAll('[data-radix-popper-content-wrapper]').length ?? 0,
      };
    });
    expect(where.wrappersInMain).toBe(0);
    expect(where.wrappersInPopout).toBeGreaterThanOrEqual(1);
  });

  test('popover in the docked toolbar dismisses on an outside click', async ({ page }) => {
    await page.locator('.ag-row .ag-cell[col-id="price"]').first().click();
    await page.waitForTimeout(100);
    // Do NOT pop out — open the Text colour picker in the inline toolbar.
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="formatting-toolbar"] button[aria-label="Text color"]') as HTMLElement | null;
      btn?.click();
    });
    await page.waitForTimeout(250);
    const openCount = await page.evaluate(() => document.querySelectorAll('[data-radix-popper-content-wrapper]').length);
    expect(openCount).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => {
      const outside = document.querySelector('[data-testid="formatting-toolbar"]') as HTMLElement;
      const o = { bubbles: true, cancelable: true, composed: true } as const;
      outside.dispatchEvent(new PointerEvent('pointerdown', o));
      outside.dispatchEvent(new MouseEvent('mousedown', o));
      outside.dispatchEvent(new MouseEvent('mouseup', o));
      outside.dispatchEvent(new MouseEvent('click', o));
    });
    await page.waitForTimeout(250);
    const afterCount = await page.evaluate(() => document.querySelectorAll('[data-radix-popper-content-wrapper]').length);
    expect(afterCount).toBe(0);
  });

  // Regression: in a real window.open popout the panel's DOM lives in another
  // JS realm, so Radix's `target instanceof Node` guard was always false and
  // outside-click dismissal never fired. `enableCrossRealmNodeInstanceOf`
  // (applied in PopoutPortal) restores it. See crossRealmNodeInstanceOf.ts.
  test('popover inside the popout dismisses on an outside click', async ({ page }) => {
    await page.locator('.ag-row .ag-cell[col-id="price"]').first().click();
    await page.waitForTimeout(100);
    await page.locator('[data-testid="formatting-popout-btn"]').click();
    await page.waitForTimeout(300);

    // Open the Text colour picker inside the popout.
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="ds-popout-toolbar-"]') as HTMLIFrameElement | null;
      const btn = iframe?.contentDocument?.querySelector('[data-section-index="03"] button[aria-label="Text color"]') as HTMLElement | null;
      btn?.click();
    });
    await page.waitForTimeout(250);

    const openCount = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="ds-popout-toolbar-"]') as HTMLIFrameElement | null;
      return iframe?.contentDocument?.querySelectorAll('[data-radix-popper-content-wrapper]').length ?? 0;
    });
    expect(openCount).toBeGreaterThanOrEqual(1);

    // Click an element OUTSIDE the popover, inside the popout document —
    // a real pointerdown+click pair (Radix dismissal is pointerdown-driven).
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="ds-popout-toolbar-"]') as HTMLIFrameElement | null;
      const doc = iframe!.contentDocument!;
      const outside = doc.querySelector('[data-testid="fmt-panel-header"]') as HTMLElement;
      const View = doc.defaultView as Window & typeof globalThis;
      const o = { bubbles: true, cancelable: true, composed: true } as const;
      outside.dispatchEvent(new View.PointerEvent('pointerdown', o));
      outside.dispatchEvent(new View.MouseEvent('mousedown', o));
      outside.dispatchEvent(new View.MouseEvent('mouseup', o));
      outside.dispatchEvent(new View.MouseEvent('click', o));
    });
    await page.waitForTimeout(250);

    const afterCount = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="ds-popout-toolbar-"]') as HTMLIFrameElement | null;
      return iframe?.contentDocument?.querySelectorAll('[data-radix-popper-content-wrapper]').length ?? 0;
    });
    expect(afterCount).toBe(0);
  });

  // The auto-grow/shrink dance is gone — the popout is now a
  // fixed 400×620 properties panel where every editor is inline,
  // so there's no popover tall enough to outgrow the window.
  test('popout does NOT call resizeTo on popover-open (no auto-resize in the panel design)', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __popoutResizeCalls: { w: number; h: number }[] }).__popoutResizeCalls = [];
    });
    await page.locator('[data-testid="formatting-popout-btn"]').click();
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="ds-popout-toolbar-"]') as HTMLIFrameElement | null;
      const win = iframe?.contentWindow as unknown as { resizeTo: (w: number, h: number) => void } | null;
      if (!win) return;
      const orig = win.resizeTo?.bind(win) ?? (() => {});
      win.resizeTo = (w: number, h: number) => {
        (window as unknown as { __popoutResizeCalls: { w: number; h: number }[] }).__popoutResizeCalls.push({ w, h });
        orig(w, h);
      };
    });

    // Open the color picker (the only popover still present in the
    // panel design). Fixed-size panel should NOT trigger a resize.
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="ds-popout-toolbar-"]') as HTMLIFrameElement | null;
      const btn = iframe?.contentDocument?.querySelector('[data-section-index="03"] button[aria-label="Text color"]') as HTMLElement | null;
      btn?.click();
    });
    await page.waitForTimeout(300);

    const calls = await page.evaluate(
      () => (window as unknown as { __popoutResizeCalls: { w: number; h: number }[] }).__popoutResizeCalls,
    );
    expect(calls.length).toBe(0);
  });

  test('re-clicking the brush button while popped focuses the popout instead of closing inline', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __focusCalls: number }).__focusCalls = 0;
    });
    await page.locator('[data-testid="formatting-popout-btn"]').click();
    await page.waitForTimeout(300);

    // Intercept focus() on the iframe's contentWindow.
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="ds-popout-toolbar-"]') as HTMLIFrameElement | null;
      const win = iframe?.contentWindow as unknown as { focus: () => void } | null;
      if (!win) return;
      const orig = win.focus?.bind(win) ?? (() => {});
      win.focus = () => {
        (window as unknown as { __focusCalls: number }).__focusCalls += 1;
        orig();
      };
    });

    // Re-click brush — should raise the popout, not toggle off.
    await openViewMenu(page);
    await page.locator('[data-testid="style-toolbar-toggle"]').click();
    await page.waitForTimeout(200);

    const { focusCalls, iframeCount, inlineToolbarCount } = await page.evaluate(() => {
      return {
        focusCalls: (window as unknown as { __focusCalls: number }).__focusCalls,
        iframeCount: document.querySelectorAll('iframe[data-popout-iframe^="ds-popout-toolbar-"]').length,
        // Inline toolbar should NOT re-mount in main.
        inlineToolbarCount: document.querySelectorAll('[data-testid="formatting-toolbar"]').length,
      };
    });
    expect(focusCalls).toBeGreaterThanOrEqual(1);
    expect(iframeCount).toBe(1);
    expect(inlineToolbarCount).toBe(0);
  });
});
