import { test, expect } from '@playwright/test';

test.describe('Chroma Desk visual smoke', () => {
  test('demo-react boots without console errors mentioning undefined CSS vars', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors.filter(e => /var\(--/.test(e) && /undefined/i.test(e))).toEqual([]);
  });

  test('shadcn Select does not render white-on-white in dark', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const select = page.locator('[role="combobox"]').first();
    if (await select.count() === 0) test.skip();
    const bg = await select.evaluate(el => getComputedStyle(el).backgroundColor);
    // not pure white
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });

  test('.ds-scrollbar elements are styled', async ({ page }) => {
    await page.goto('/');
    const handles = page.locator('.ds-scrollbar');
    if (await handles.count() === 0) test.skip();
    const sw = await handles.first().evaluate(el => getComputedStyle(el).scrollbarWidth);
    expect(sw).toBe('thin');
  });
});
