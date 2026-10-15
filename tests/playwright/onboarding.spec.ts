import { test, expect } from '@playwright/test';

test.describe('Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    (page as any).consoleErrors = consoleErrors;

    // Mock authenticated user without onboarding completion
    await page.addInitScript((session) => {
      localStorage.setItem('sb-mock-auth-token', JSON.stringify(session));
    }, {
      access_token: 'mock-token',
      user: {
        id: '00000000-0000-0000-0000-000000000002',
        email: 'newuser@indotek.com',
      },
    });

    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: '00000000-0000-0000-0000-000000000002',
            email: 'newuser@indotek.com',
          },
          session: { access_token: 'mock-token' },
        }),
      });
    });

    await page.route('**/rest/v1/users*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: '00000000-0000-0000-0000-000000000002',
          email: 'newuser@indotek.com',
          name: null,
          role: null,
          workspace_id: null,
          is_onboarding_complete: false,
        }]),
      });
    });
  });

  test('displays onboarding wizard for new user', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('h1:has-text("Selamat Datang")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Siapa nama Anda')).toBeVisible();
    
    const errors = (page as any).consoleErrors;
    expect(errors.filter((e: string) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('completes onboarding with workspace creation', async ({ page }) => {
    await page.route('**/rest/v1/rpc/complete_onboarding', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          workspace_id: 'ws-new',
          user_id: '00000000-0000-0000-0000-000000000002',
        }),
      });
    });

    await page.goto('/');

    // Step 1: Fill name
    await page.fill('input[placeholder*="nama"]', 'Budi Santoso');
    await expect(page.locator('input[value="budi-santoso"]')).toBeVisible();

    // Step 2: Fill workspace name
    await page.fill('input[placeholder*="perusahaan"]', 'PT Konstruksi Sejahtera');
    
    // Step 3: Fill description (optional)
    await page.fill('textarea', 'Perusahaan konstruksi berpengalaman 15 tahun');

    // Submit
    await page.click('button:has-text("Mulai")');

    // Should redirect to dashboard
    await expect(page).toHaveURL('/', { timeout: 10000 });
  });

  test('validates required fields', async ({ page }) => {
    await page.goto('/');

    // Try to submit without filling name
    await page.click('button:has-text("Mulai")');

    await expect(page.locator('text=Nama wajib diisi')).toBeVisible();
  });

  test('generates workspace slug from name', async ({ page }) => {
    await page.goto('/');

    const nameInput = page.locator('input[placeholder*="nama"]');
    await nameInput.fill('Ahmad Rizki');

    const slugInput = page.locator('input[value]').first();
    await expect(slugInput).toHaveValue('ahmad-rizki');
  });

  test('allows custom workspace slug', async ({ page }) => {
    await page.goto('/');

    await page.fill('input[placeholder*="nama"]', 'Ahmad Rizki');
    
    const slugInput = page.locator('input[value="ahmad-rizki"]');
    await slugInput.clear();
    await slugInput.fill('ahmad-custom-slug');

    await expect(slugInput).toHaveValue('ahmad-custom-slug');
  });

  test('handles onboarding API errors gracefully', async ({ page }) => {
    await page.route('**/rest/v1/rpc/complete_onboarding', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Workspace slug already exists',
          message: 'Workspace slug already exists',
        }),
      });
    });

    await page.goto('/');

    await page.fill('input[placeholder*="nama"]', 'Test User');
    await page.fill('input[placeholder*="perusahaan"]', 'Test Company');
    await page.click('button:has-text("Mulai")');

    await expect(page.locator('text=Workspace slug already exists')).toBeVisible({ timeout: 3000 });
  });
});
