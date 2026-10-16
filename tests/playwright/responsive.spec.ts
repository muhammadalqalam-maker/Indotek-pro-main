import { test, expect } from '@playwright/test';
import { authenticateTestPage, mockSupabaseRestFallback } from './helpers/authenticatedPage';

test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRestFallback(page);
    await authenticateTestPage(page);
    await page.goto('/');
  });

  test('shows the bottom navigation on mobile and hides it on desktop', async ({ page, viewport }) => {
    const navigation = page.getByRole('navigation', { name: 'Navigasi utama' });

    if (viewport && viewport.width < 1024) {
      await expect(navigation).toBeVisible();
      await expect(navigation.getByRole('link', { name: 'Beranda' })).toBeVisible();
      await expect(navigation.getByRole('link', { name: 'Proyek' })).toBeVisible();
    } else {
      await expect(navigation).toBeHidden();
    }
  });

  test('keeps the dashboard within the active viewport width', async ({ page, viewport }) => {
    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));

    expect(dimensions.viewportWidth).toBe(viewport?.width);
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  });

  test('declares a responsive viewport and the application theme color', async ({ page }) => {
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      'width=device-width, initial-scale=1.0, viewport-fit=cover'
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#12352B');
  });

  test('declares iOS home-screen metadata', async ({ page }) => {
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'))
      .toHaveAttribute('content', 'black-translucent');
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Indotek Pro');
  });

  test('provides mobile navigation links with at least 44px tap targets', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width >= 1024, 'Mobile tap targets apply below the desktop breakpoint.');

    const links = page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link');
    await expect(links).toHaveCount(5);

    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('respects reduced-motion preferences', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const transitionDuration = await page.locator('html')
      .evaluate((element) => getComputedStyle(element).transitionDuration);

    expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.001);
  });

  test('keeps layouts and navigation valid at phone, tablet, and desktop widths', async ({ page }) => {
    for (const width of [375, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(dimensions.documentWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(width);

      const navigation = page.getByRole('navigation', { name: 'Navigasi utama' });
      if (width < 1024) {
        await expect(navigation).toBeVisible();
      } else {
        await expect(navigation).toBeHidden();
      }
    }
  });
});
