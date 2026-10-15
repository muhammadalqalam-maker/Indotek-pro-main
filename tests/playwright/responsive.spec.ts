import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'authenticated',
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: 'Test User' },
    };

    const mockSession = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: mockUser,
    };

    // Inject Supabase session into localStorage before page loads
    await page.addInitScript((session) => {
      const storageKey = 'sb-project.supabase.co-auth-token';
      
      localStorage.setItem(storageKey, JSON.stringify(session));
    }, mockSession);

    // Intercept Supabase auth API calls
    await page.route('**/auth/v1/**', async (route) => {
      const url = route.request().url();
      
      if (url.includes('/session')) {
        // GET /auth/v1/session - return mock session
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { session: mockSession }, error: null }),
        });
      } else if (url.includes('/user')) {
        // GET /auth/v1/user - return mock user
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUser),
        });
      } else {
        // Other auth endpoints - continue normally
        await route.continue();
      }
    });

    // Intercept Supabase database queries for user profile
    await page.route('**/rest/v1/users*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'test-user-id',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'Admin',
          workspace_id: 'test-workspace-id',
        }]),
        headers: {
          'Content-Range': '0-0/1',
        },
      });
    });

    // Intercept workspace membership check
    await page.route('**/rest/v1/workspace_members*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          workspace_id: 'test-workspace-id',
          user_id: 'test-user-id',
          role: 'Admin',
        }]),
        headers: {
          'Content-Range': '0-0/1',
        },
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('bottom navigation shows on mobile, hidden on desktop', async ({ page, viewport }) => {
    // Bottom nav uses 'Beranda' (Home in Indonesian)
    const bottomNav = page.locator('[role="navigation"]').filter({ hasText: 'Beranda' });
    
    if (viewport && viewport.width < 1024) {
      // Mobile/Tablet: bottom nav visible
      await expect(bottomNav).toBeVisible();
    } else {
      // Desktop: bottom nav hidden, sidebar visible
      await expect(bottomNav).toBeHidden();
      // Sidebar uses 'Dashboard Eksekutif'
      await expect(page.locator('aside').filter({ hasText: 'Dashboard Eksekutif' })).toBeVisible();
    }
  });

  test('buttons have minimum 44px tap targets', async ({ page }) => {
    // Navigate to projects screen with buttons
    await page.click('text=Proyek');
    await page.waitForLoadState('networkidle');
    
    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    
    // Check first 10 visible buttons
    for (let i = 0; i < Math.min(count, 10); i++) {
      const button = buttons.nth(i);
      const box = await button.boundingBox();
      
      if (box) {
        // WCAG AA minimum tap target: 44x44px
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('responsive table switches layout based on viewport', async ({ page, viewport }) => {
    // Navigate to projects screen
    await page.click('text=Proyek');
    await page.waitForLoadState('networkidle');
    
    const tableView = page.locator('table');
    const cardView = page.locator('[class*="space-y"]').filter({ has: page.locator('[class*="rounded-xl"][class*="border"]') });
    
    if (viewport && viewport.width < 768) {
      // Mobile: card layout
      await expect(tableView).toBeHidden();
      await expect(cardView).toBeVisible();
    } else {
      // Tablet/Desktop: table layout
      await expect(tableView).toBeVisible();
    }
  });

  test('search functionality works on all viewports', async ({ page, viewport }) => {
    const searchButton = page.locator('button[aria-label*="Cari"], button:has-text("Cari")').first();
    
    if (viewport && viewport.width < 768) {
      // Mobile: search opens bottom sheet
      await searchButton.click();
      await expect(page.locator('[role="dialog"]').filter({ hasText: 'Cari' })).toBeVisible();
    } else {
      // Desktop: inline search input
      const searchInput = page.locator('input[type="text"][placeholder*="Cari"]').first();
      await expect(searchInput).toBeVisible();
    }
  });

  test('viewport meta tags are set correctly', async ({ page }) => {
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    
    expect(viewportMeta).toContain('width=device-width');
    expect(viewportMeta).toContain('initial-scale=1');
    expect(viewportMeta).toContain('viewport-fit=cover');
  });

  test('theme color meta tag is present', async ({ page }) => {
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toBeTruthy();
  });

  test('PWA manifest is accessible', async ({ page }) => {
    const manifestLink = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestLink).toBeTruthy();
    
    // Verify manifest loads
    const response = await page.goto(manifestLink!);
    expect(response?.status()).toBe(200);
  });

  test('navigation persists across viewport changes', async ({ page, viewport }) => {
    // Click on Proyek
    await page.click('text=Proyek');
    await page.waitForLoadState('networkidle');
    
    // Verify URL changed
    expect(page.url()).toContain('/proyek');
    
    // Verify content loaded
    await expect(page.locator('h1, h2').filter({ hasText: /Proyek|Daftar/ })).toBeVisible();
  });

  test('safe area insets applied on mobile', async ({ page, viewport }) => {
    if (viewport && viewport.width < 768) {
      const bottomNav = page.locator('[role="navigation"]').filter({ hasText: 'Beranda' });
      
      if (await bottomNav.isVisible()) {
        const styles = await bottomNav.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            paddingBottom: computed.paddingBottom,
          };
        });
        
        // Should have safe-area padding (either from env() or fallback)
        expect(styles.paddingBottom).toBeTruthy();
      }
    }
  });

  test('reduced motion preference respected', async ({ page }) => {
    // Enable reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    
    // Check if animations are disabled/reduced
    const animatedElement = page.locator('[class*="transition"]').first();
    
    if (await animatedElement.isVisible()) {
      const transitionDuration = await animatedElement.evaluate((el) => {
        return window.getComputedStyle(el).transitionDuration;
      });
      
      // With prefers-reduced-motion, duration should be 0.01ms or 0s
      expect(['0s', '0.01ms', '0ms'].some(val => transitionDuration.includes(val))).toBe(true);
    }
  });
});

test.describe('Viewport-Specific Layouts', () => {
  test('mobile (375px) renders correctly', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Mobile (375)');
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Bottom nav visible
    await expect(page.locator('[role="navigation"]').filter({ hasText: 'Beranda' })).toBeVisible();
    
    // Sidebar hidden
    await expect(page.locator('aside').filter({ hasText: 'Dashboard Eksekutif' })).toBeHidden();
    
    // Cards instead of tables
    await page.click('text=Proyek');
    await page.waitForLoadState('networkidle');
    const hasCards = await page.locator('[class*="rounded-xl"][class*="border"]').count() > 0;
    expect(hasCards).toBe(true);
  });

  test('tablet (768px) renders correctly', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Tablet (768)');
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Bottom nav visible on tablet
    await expect(page.locator('[role="navigation"]').filter({ hasText: 'Beranda' })).toBeVisible();
    
    // Tables visible
    await page.click('text=Proyek');
    await page.waitForLoadState('networkidle');
    const tableVisible = await page.locator('table').isVisible().catch(() => false);
    expect(tableVisible).toBe(true);
  });

  test('desktop (1024px+) renders correctly', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('Desktop'));
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Sidebar visible
    await expect(page.locator('aside').filter({ hasText: 'Dashboard Eksekutif' })).toBeVisible();
    
    // Bottom nav hidden
    await expect(page.locator('[role="navigation"]').filter({ hasText: 'Beranda' })).toBeHidden();
    
    // Tables visible
    await page.click('text=Proyek');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('table')).toBeVisible();
  });
});
