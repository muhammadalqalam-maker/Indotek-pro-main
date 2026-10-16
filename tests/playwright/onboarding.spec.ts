import { test, expect } from '@playwright/test';
import { authenticateTestPage, mockSupabaseRestFallback } from './helpers/authenticatedPage';

test.describe('Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRestFallback(page);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    (page as any).consoleErrors = consoleErrors;

    await authenticateTestPage(page, {
      withWorkspace: false,
      userId: '00000000-0000-0000-0000-000000000002',
      email: 'newuser@indotek.com',
    });
  });

  test('displays onboarding wizard for new user', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Selamat Datang di Indotek Pro' })).toBeVisible();
    await expect(page.locator('#onboarding-company-name')).toBeVisible();
    
    const errors = (page as any).consoleErrors;
    expect(errors.filter((e: string) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('completes onboarding with workspace creation', async ({ page }) => {
    await page.route('**/rest/v1/rpc/create_workspace', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          workspace_id: 'ws-new',
        }),
      });
    });

    await page.goto('/');

    await page.locator('#onboarding-company-name').fill('PT Konstruksi Sejahtera');
    await expect(page.locator('#onboarding-slug')).toHaveValue('pt-konstruksi-sejahtera');

    await page.locator('#onboarding-address').fill('Makassar');

    await page.getByRole('button', { name: 'Buat Perusahaan & Mulai' }).click();

    await expect(page.getByRole('heading', { name: 'Workspace berhasil dibuat!' })).toBeVisible();
  });

  test('validates required fields', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Buat Perusahaan & Mulai' })).toBeDisabled();
    await page.locator('#onboarding-company-name').fill('PT Valid');
    await page.locator('#onboarding-slug').clear();
    await expect(page.getByRole('button', { name: 'Buat Perusahaan & Mulai' })).toBeDisabled();
    await page.locator('#onboarding-slug').fill('pt-valid');
    await expect(page.getByRole('button', { name: 'Buat Perusahaan & Mulai' })).toBeEnabled();
  });

  test('generates workspace slug from name', async ({ page }) => {
    await page.goto('/');

    const nameInput = page.locator('#onboarding-company-name');
    await nameInput.fill('Ahmad Rizki');

    const slugInput = page.locator('#onboarding-slug');
    await expect(slugInput).toHaveValue('ahmad-rizki');
  });

  test('allows custom workspace slug', async ({ page }) => {
    await page.goto('/');

    await page.locator('#onboarding-company-name').fill('Ahmad Rizki');
    
    const slugInput = page.locator('#onboarding-slug');
    await expect(slugInput).toHaveValue('ahmad-rizki');
    await slugInput.clear();
    await slugInput.fill('ahmad-custom-slug');

    await expect(slugInput).toHaveValue('ahmad-custom-slug');
  });

  test('handles onboarding API errors gracefully', async ({ page }) => {
    await page.route('**/rest/v1/rpc/create_workspace', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Workspace slug already exists',
        }),
      });
    });

    await page.goto('/');

    await page.locator('#onboarding-company-name').fill('Test Company');
    await page.locator('#onboarding-slug').fill('test-company');
    await page.getByRole('button', { name: 'Buat Perusahaan & Mulai' }).click();

    await expect(page.locator('text=Workspace slug already exists')).toBeVisible({ timeout: 3000 });
  });
});
