import { test, expect } from '@playwright/test';

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
const MOCK_ACCESS_TOKEN = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  Buffer.from(JSON.stringify({
    sub: MOCK_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    exp: 1893456000,
    email: 'test@indotek.com',
  })).toString('base64url'),
  'mock-signature',
].join('.');

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

    await page.route('**/rest/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
        headers: { 'Content-Range': '0-0/0' },
      });
    });
    await page.route('**/rest/v1/profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: '00000000-0000-0000-0000-000000000001',
          email: 'test@indotek.com',
          full_name: 'Test User',
          nip: '12345',
        }]),
        headers: { 'Content-Range': '0-0/1' },
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
          role: 'owner',
          status: 'Aktif',
          all_projects: true,
        }]),
        headers: { 'Content-Range': '0-0/1' },
      });
    });

    // Mock Supabase auth endpoints
    await page.route('**/auth/v1/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      const requestUrl = new URL(url);

      if (requestUrl.pathname.endsWith('/token') && requestUrl.searchParams.get('grant_type') === 'password' && method === 'POST') {
        const body = route.request().postDataJSON();
        if (body.email === 'test@indotek.com' && body.password === 'password123') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              access_token: MOCK_ACCESS_TOKEN,
              refresh_token: 'mock-refresh-token',
              expires_in: 3600,
              token_type: 'bearer',
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
      } else if (url.includes('/user') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: MOCK_USER_ID,
            email: 'test@indotek.com',
            email_confirmed_at: '2026-01-01T00:00:00Z',
            user_metadata: { full_name: 'Test User' },
            app_metadata: { providers: ['email'] },
          }),
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

      await expect(page.getByRole('heading', { name: 'Masuk ke Akun' })).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Masuk ke Portal Proyek' })).toBeVisible();

      // Check no console errors on initial load
      const errors = (page as any).consoleErrors;
      expect(errors.filter((e: string) => !e.includes('ResizeObserver'))).toHaveLength(0);
    });

    test('successfully logs in with valid credentials', async ({ page }) => {
      await page.goto('/');
      await page.fill('input[type="email"]', 'test@indotek.com');
      await page.fill('input[type="password"]', 'password123');
      await page.getByRole('button', { name: 'Masuk ke Portal Proyek' }).click();

      // Should redirect to dashboard after successful login
      await page.waitForURL('/', { timeout: 5000 });
      await expect(page.getByRole('heading', { name: 'Dashboard Monitoring Portofolio' })).toBeVisible({ timeout: 5000 });
    });

    test('displays error message for invalid credentials', async ({ page }) => {
      await page.goto('/');
      await page.fill('input[type="email"]', 'wrong@example.com');
      await page.fill('input[type="password"]', 'wrongpass');
      await page.click('button:has-text("Masuk")');

      await expect(page.getByText('Email atau kata sandi tidak sesuai. Periksa kembali data akun Anda.')).toBeVisible({ timeout: 3000 });
    });

    test('validates email format', async ({ page }) => {
      await page.goto('/');
      await page.fill('input[type="email"]', 'invalid-email');
      await page.fill('input[type="password"]', 'password123');
      await page.getByRole('button', { name: 'Masuk ke Portal Proyek' }).click();

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
            access_token: MOCK_ACCESS_TOKEN,
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
            token_type: 'bearer',
            user: { id: '1', email: 'test@indotek.com' },
          }),
        });
      });

      await page.getByRole('button', { name: 'Masuk ke Portal Proyek' }).click();
      await expect(page.getByRole('button', { name: 'Memverifikasi...' })).toBeDisabled();
    });

    test('completes two-step auth flow without hanging (regression for C2)', async ({ page }) => {
      // Mock auth token endpoint with delay
      await page.route('**/auth/v1/token*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: MOCK_ACCESS_TOKEN,
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
            token_type: 'bearer',
            user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@indotek.com' },
          }),
        });
      });

      await page.goto('/');
      await page.fill('input[type="email"]', 'test@indotek.com');
      await page.fill('input[type="password"]', 'password123');
      await page.getByRole('button', { name: 'Masuk ke Portal Proyek' }).click();

      // Verify loading state appears
      await expect(page.getByRole('button', { name: 'Memverifikasi...' })).toBeDisabled();

      // Critical regression check: auth flow completes, no infinite loading
      // If user_profiles mock missing, this would timeout with isPendingApproval=true
      await expect(page.getByRole('heading', { name: 'Dashboard Monitoring Portofolio' })).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Password Reset Flow', () => {
    test('opens password reset modal', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Lupa kata sandi?' }).click();

      await expect(page.getByRole('heading', { name: 'Atur Ulang Kata Sandi' })).toBeVisible();
      await expect(page.locator('input[type="email"]').nth(1)).toBeVisible();
    });

    test('sends password reset email', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Lupa kata sandi?' }).click();

      const modalEmail = page.locator('input[type="email"]').nth(1);
      await modalEmail.fill('test@indotek.com');
      await page.getByRole('button', { name: 'Kirim Tautan Pemulihan' }).click();

      await expect(page.getByText(/Tautan instruksi pemulihan kata sandi telah dikirim/)).toBeVisible({ timeout: 3000 });
    });

    test('validates email in reset form', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Lupa kata sandi?' }).click();

      const modalEmail = page.locator('input[type="email"]').nth(1);
      await modalEmail.fill('invalid');
      await page.getByRole('button', { name: 'Kirim Tautan Pemulihan' }).click();

      const validationMessage = await modalEmail.evaluate((el: HTMLInputElement) => el.validationMessage);
      expect(validationMessage).toBeTruthy();
    });

    test('closes reset modal with cancel button', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Lupa kata sandi?' }).click();
      await expect(page.getByRole('heading', { name: 'Atur Ulang Kata Sandi' })).toBeVisible();

      await page.getByRole('button', { name: 'Tutup' }).click();
      await expect(page.getByRole('heading', { name: 'Atur Ulang Kata Sandi' })).not.toBeVisible();
    });
  });

  test.describe('Update Password Flow', () => {
    test('shows update password form with recovery token', async ({ page }) => {
      await page.goto(`/#access_token=${MOCK_ACCESS_TOKEN}&refresh_token=mock-refresh-token&expires_in=3600&token_type=bearer&type=recovery`);

      await expect(page.getByRole('heading', { name: 'Perbarui Kata Sandi' })).toBeVisible();
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
      await expect(page.locator('input[type="password"]').last()).toBeVisible();
    });

    test('updates password successfully', async ({ page }) => {
      await page.goto(`/#access_token=${MOCK_ACCESS_TOKEN}&refresh_token=mock-refresh-token&expires_in=3600&token_type=bearer&type=recovery`);

      await page.getByPlaceholder('Minimal 12 karakter', { exact: true }).fill('newPassword123!');
      await page.getByPlaceholder('Masukkan kembali kata sandi').fill('newPassword123!');
      await page.getByRole('button', { name: 'Perbarui Kata Sandi' }).click();

      await expect(page.getByRole('status')).toHaveText(
        'Kata sandi berhasil diperbarui. Anda dapat melanjutkan menggunakan akun Anda.',
        { timeout: 3000 },
      );
      await expect(page.getByRole('button', { name: 'Selesai' })).toBeVisible();
      await page.getByRole('button', { name: 'Selesai' }).click();
      await expect(page.getByRole('heading', { name: 'Perbarui Kata Sandi' })).not.toBeVisible();
    });

    test('validates password length', async ({ page }) => {
      await page.goto(`/#access_token=${MOCK_ACCESS_TOKEN}&refresh_token=mock-refresh-token&expires_in=3600&token_type=bearer&type=recovery`);

      await page.getByPlaceholder('Minimal 12 karakter', { exact: true }).fill('short');
      await page.getByPlaceholder('Masukkan kembali kata sandi').fill('short');
      await page.getByRole('button', { name: 'Perbarui Kata Sandi' }).click();

      await expect(page.getByText(/minimal 12 karakter/)).toBeVisible();
    });
  });

  test.describe('Google Sign-In', () => {
    test('displays Google sign-in button', async ({ page }) => {
      await page.goto('/');

      const googleButton = page.getByRole('button', { name: 'Masuk via Google Workspace' });
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

      const googleButton = page.getByRole('button', { name: 'Masuk via Google Workspace' });
      await googleButton.click();

      // In real scenario, this would open OAuth popup
      // Here we just verify the button is clickable without errors
      const errors = (page as any).consoleErrors;
      expect(errors.filter((e: string) => !e.includes('ResizeObserver'))).toHaveLength(0);
    });
  });
});
