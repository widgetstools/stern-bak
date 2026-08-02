/**
 * Visual-reference capture — drives demo-react through every customizer
 * surface and writes one PNG per state under `docs/visual-reference/v1/`
 * (override with `VR_OUT`).
 *
 * Opt-in only — not part of the regular e2e suite:
 *
 *   npx playwright test e2e/visual-reference-capture.spec.ts
 *
 * Each capture re-uses the existing `bootCleanDemo` / `openPanel`
 * helpers under `./helpers/settingsSheet.ts`. That keeps the capture
 * paths in lockstep with what the smoke specs assert — if a testid /
 * trigger renames, both break together.
 *
 * Output directory: `VR_OUT` env var, defaulting to
 * `<repo>/docs/visual-reference/v1/`. Set to a scratch dir during iteration:
 *
 *   VR_OUT=/tmp/vr npx playwright test e2e/visual-reference-capture.spec.ts
 *
 * Themes:
 *   - The spec covers both `[data-theme="dark"]` (default) and
 *     `[data-theme="light"]` for every surface. Themes are toggled
 *     via the demo's existing theme switcher — no DOM-injection
 *     shortcut, matching capture realism expectations.
 */

import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  bootCleanDemo,
  openSettingsSheet,
  closeSettingsSheet,
  openPanel,
  type PanelModuleId,
} from './helpers/settingsSheet';

const VR_OUT =
  process.env.VR_OUT ??
  join(process.cwd(), 'docs', 'visual-reference', 'v1');

type Theme = 'dark' | 'light';

const PANELS: Array<{ id: PanelModuleId; slug: string }> = [
  { id: 'general-settings', slug: 'grid-options' },
  { id: 'column-customization', slug: 'column-settings' },
  { id: 'calculated-columns', slug: 'calculated-columns' },
  { id: 'column-groups', slug: 'column-groups' },
  { id: 'conditional-styling', slug: 'conditional-styling' },
];

/** Switch the demo's theme via the DOM. v1's demo applies the theme
 *  to `<html data-theme="...">`; the design-system stylesheets key
 *  off the attribute, so toggling it here exercises the real cascade.
 *
 *  NOTE: a more realistic flow would click the demo's theme switcher
 *  button. v1's demo doesn't surface a stable testid for the switcher,
 *  so we set the attribute directly. The risk is missing animation
 *  state at the moment of swap — acceptable for visual reference since
 *  every other state is captured at rest. */
async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  // Let the design-system transitions settle.
  await page.waitForTimeout(300);
}

async function shot(page: Page, theme: Theme, slug: string): Promise<void> {
  const dir = join(VR_OUT, theme);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${slug}.png`);
  await page.screenshot({ path, fullPage: false });
}

test.describe('@vr v1 visual reference capture', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanDemo(page);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`${theme} — grid default`, async ({ page }) => {
      await setTheme(page, theme);
      await shot(page, theme, 'grid-default');
    });

    test(`${theme} — settings sheet open (no panel selected)`, async ({
      page,
    }) => {
      await setTheme(page, theme);
      await openSettingsSheet(page);
      await shot(page, theme, 'settings-sheet-open');
      await closeSettingsSheet(page);
    });

    for (const { id, slug } of PANELS) {
      test(`${theme} — panel: ${slug}`, async ({ page }) => {
        await setTheme(page, theme);
        await openPanel(page, id);
        // Wait for the panel root to render.
        await page.waitForTimeout(200);
        await shot(page, theme, `panel-${slug}`);
        await closeSettingsSheet(page);
      });
    }

    test(`${theme} — module menubar visible`, async ({ page }) => {
      await setTheme(page, theme);
      await openSettingsSheet(page);
      await expect(page.locator('[data-testid="v2-settings-module-menubar"]')).toBeVisible();
      await page.waitForTimeout(200);
      await shot(page, theme, 'module-menubar-visible');
      await closeSettingsSheet(page);
    });
  }

  // Sanity assertion so the test reports surface a useful artefact
  // even when one shot fails — Playwright's HTML report shows the
  // actual screenshot inline beneath any failing expect().
  test('@vr capture summary', async () => {
    expect(VR_OUT).toBeTruthy();
    // eslint-disable-next-line no-console -- diagnostic
    console.info(`[vr-capture] wrote screenshots under ${VR_OUT}`);
  });
});
