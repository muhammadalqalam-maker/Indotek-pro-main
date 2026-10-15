import { test, expect } from '@playwright/test';

test.describe('Authentication Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Monitor console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    (page as any).consoleErrors = consoleErrors;

    // Mock Supabase auth endpoints
    await page.route('**/auth/v1/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes('/token?grant_type=password') && method === 'POST') {
        const body = route.request().postDataJSON();
        if (body.email === 'test@indotek.com' && body.password === 'password123') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              access_token: 'mock-access-token',
              refresh_token: 'mock-refresh-token',
              user: {
                id: '00000000-0000-0000-0000-000000000001',
                email: 'test@indotek.com',
                email_confirmed_at: '2026-01-01T00:00:00Z',
              },
            }),
          });
        } else {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Invalid login credentials' }),
          });
        }
      } else if (url.includes('/recover') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      } else if (url.includes('/user') && method === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: '00000000-0000-0000-0000-000000000001',
              email: 'test@indotek.com',
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: null, session: null }),
        });
      }
    });
  });

  test.describe('Login Flow', () => {
    test('displays login form with email and password fields', async ({ page }) => {
      await page.goto('/');

      await expect(page.locator('h1:has-text("Masuk ke Indotek Pro")')).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button:has-text("Masuk")')).toBeVisible();

      // Check no console errors on initial load
      const errors = (page as any).consoleErrors;
      expect(errors.filter((e: string) => !e.includes('ResizeObserver'))).toHaveLength(0);
    });

    test('successfully logs in with valid credentials', async ({ page }) => {
      await page.route('**/rest/v1/users*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: '00000000-0000-0000-0000-000000000001',
            email: 'test@indotek.com',
            name: 'Test User',
            role: 'Owner',
            workspace_id: 'ws-test',
            workspace_name: 'Test Workspace',
            is_email_verified: true,
            is_onboarding_complete: true,
          }]),
        });
      });

      await page.route('**/rest/v1/workspace_members*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'member-1',
            user_id: '00000000-0000-0000-0000-000000000001',
            workspace_id: 'ws-test',
            role: 'Owner',
            status: 'Aktif',
          }]),
        });
      });

      await page.goto('/');
      await page.fill('input[type="email"]', 'test@indotek.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button:has-text("Masuk")');

      // Should redirect to dashboard after successful login
      await page.waitForURL('/', { timeout: 5000 });
      await expect(page.locator('h1:has-text("Dashboard Eksekutif")')).toBeVisible({ timeout: 5000 });
    });

    test('displays error message for invalid credentials', async ({ page }) => {
      await page.goto('/');
      await page.fill('input[type="email"]', 'wrong@example.com');
      await page.fill('input[type="password"]', 'wrongpass');
      await page.click('button:has-text("Masuk")');

      await expect(page.locator('text=Invalid login credentials')).toBeVisible({ timeout: 3000 });
    });

    test('validates email format', async ({ page }) => {
      await page.goto('/');
      await page.fill('input[type="email"]', 'invalid-email');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button:has-text("Masuk")');

      const emailInput = page.locator('input[type="email"]');
      const validationMessage = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage);
      expect(validationMessage).toBeTruthy();
    });

    test('shows loading state during login', async ({ page }) => {
      await page.goto('/');
      await page.fill('input[type="email"]', 'test@indotek.com');
      await page.fill('input[type="password"]', 'password123');

      // Delay the auth response to see loading state
      await page.route('**/auth/v1/token*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'mock-access-token',
            user: { id: '1', email: 'test@indotek.com' },
          }),
        });
      });

      await page.click('button:has-text("Masuk")');
      await expect(page.locator('button:has-text("Masuk")[disabled]')).toBeVisible();
    });
  });

  test.describe('Password Reset Flow', () => {
    test('opens password reset modal', async ({ page }) => {
      await page.goto('/');
      await page.click('button:has-text("Lupa Kata Sandi")');

      await expect(page.locator('text=Reset Kata Sandi')).toBeVisible();
      await expect(page.locator('input[type="email"]').nth(1)).toBeVisible();
    });

    test('sends password reset email', async ({ page }) => {
      await page.goto('/');
      await page.click('button:has-text("Lupa Kata Sandi")');

      const modalEmail = page.locator('input[type="email"]').nth(1);
      await modalEmail.fill('test@indotek.com');
      await page.click('button:has-text("Kirim Link Reset")');

      await expect(page.locator('text=Link reset telah dikirim')).toBeVisible({ timeout: 3000 });
    });

    test('validates email in reset form', async ({ page }) => {
      await page.goto('/');
      await page.click('button:has-text("Lupa Kata Sandi")');

      const modalEmail = page.locator('input[type="email"]').nth(1);
      await modalEmail.fill('invalid');
      await page.click('button:has-text("Kirim Link Reset")');

      const validationMessage = await modalEmail.evaluate((el: HTMLInputElement) => el.validationMessage);
      expect(validationMessage).toBeTruthy();
    });

    test('closes reset modal with cancel button', async ({ page }) => {
      await page.goto('/');
      await page.click('button:has-text("Lupa Kata Sandi")');
      await expect(page.locator('text=Reset Kata Sandi')).toBeVisible();

      await page.click('button:has-text("Batal")');
      await expect(page.locator('text=Reset Kata Sandi')).not.toBeVisible();
    });
  });

  test.describe('Update Password Flow', () => {
    test('shows update password form with recovery token', async ({ page }) => {
      await page.goto('/?type=recovery&access_token=mock-recovery-token');

      await expect(page.locator('text=Buat Kata Sandi Baru')).toBeVisible();
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
      await expect(page.locator('input[type="password"]').last()).toBeVisible();
    });

    test('updates password successfully', async ({ page }) => {
      await page.goto('/?type=recovery&access_token=mock-recovery-token');

      await page.fill('input[type="password"]', 'newPassword123!');
      await page.click('button:has-text("Perbarui Kata Sandi")');

      await expect(page.locator('text=Kata sandi berhasil diperbarui')).toBeVisible({ timeout: 3000 });
    });

    test('validates password length', async ({ page }) => {
      await page.goto('/?type=recovery&access_token=mock-recovery-token');

      await page.fill('input[type="password"]', 'short');
      await page.click('button:has-text("Perbarui Kata Sandi")');

      await expect(page.locator('text=minimal 8 karakter')).toBeVisible();
    });
  });

  test.describe('Google Sign-In', () => {
    test('displays Google sign-in button', async ({ page }) => {
      await page.goto('/');

      const googleButton = page.locator('button:has-text("Masuk dengan Google")');
      await expect(googleButton).toBeVisible();
      await expect(googleButton.locator('svg')).toBeVisible(); // Google icon
    });

    test('initiates Google OAuth flow', async ({ page }) => {
      await page.goto('/');

      await page.route('**/auth/v1/authorize*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: 'https://accounts.google.com/o/oauth2/auth' }),
        });
      });

      const googleButton = page.locator('button:has-text("Masuk dengan Google")');
      await googleButton.click();

      // In real scenario, this would open OAuth popup
      // Here we just verify the button is clickable without errors
      const errors = (page as any).consoleErrors;
      expect(errors.filter((e: string) => !e.includes('ResizeObserver'))).toHaveLength(0);
    });
  });
});
