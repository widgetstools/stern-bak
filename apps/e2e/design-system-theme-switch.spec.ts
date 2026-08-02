import { test, expect } from '@playwright/test';

test.describe('Chroma Desk theme switching', () => {
  test('demo-react: data-theme + data-cvd flips repaint surfaces and accents', async ({ page }) => {
    await page.goto('/'); // demo-react root, configured per playwright.config

    // Default = dark
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const ground = () => page.evaluate(
      () => getComputedStyle(document.documentElement).getPropertyValue('--ds-surface-ground').trim(),
    );

    const darkGround = await ground();
    expect(darkGround).toBe('#0b0d10');

    // Flip to light
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    expect(await ground()).toBe('#e2e6ee');

    const accentPositive = () => page.evaluate(
      () => getComputedStyle(document.documentElement).getPropertyValue('--ds-accent-positive').trim(),
    );

    const beforeCvd = await accentPositive();

    // Toggle CVD on — accent.positive becomes cvd.buyLight
    await page.evaluate(() => document.documentElement.setAttribute('data-cvd', 'on'));
    expect(await accentPositive()).toBe('#1740a8');
    expect(await accentPositive()).not.toBe(beforeCvd);

    // Off again
    await page.evaluate(() => document.documentElement.removeAttribute('data-cvd'));
    expect(await accentPositive()).toBe(beforeCvd);
  });
});
