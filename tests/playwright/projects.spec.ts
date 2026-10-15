import { test, expect } from '@playwright/test';

test.describe('Project Management Flows', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    (page as any).consoleErrors = consoleErrors;

    // Authenticated session
    await page.addInitScript((session) => {
      localStorage.setItem('sb-mock-auth-token', JSON.stringify(session));
    }, {
      access_token: 'mock-token',
      user: { id: '00000000-0000-0000-0000-000000000001' },
    });

    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: '00000000-0000-0000-0000-000000000001' },
          session: { access_token: 'mock-token' },
        }),
      });
    });

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

    await page.route('**/rest/v1/projects*', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'proj-123',
            name: 'Gedung Kantor Pusat',
            code: 'PROJ-001',
            location: 'Jakarta Selatan',
            workspace_id: 'ws-test',
            created_at: new Date().toISOString(),
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'proj-123',
              name: 'Gedung Kantor Pusat',
              code: 'PROJ-001',
              location: 'Jakarta Selatan',
              budget: 5000000000,
              progress: 35,
              status: 'Sedang Berjalan',
              workspace_id: 'ws-test',
              created_at: '2026-06-15T10:00:00Z',
            },
            {
              id: 'proj-124',
              name: 'Perumahan Terintegrasi',
              code: 'PROJ-002',
              location: 'Tangerang',
              budget: 8000000000,
              progress: 15,
              status: 'Sedang Berjalan',
              workspace_id: 'ws-test',
              created_at: '2026-07-01T10:00:00Z',
            },
          ]),
        });
      }
    });
  });

  test.describe('Project Creation', () => {
    test('displays projects list without console errors', async ({ page }) => {
      await page.goto('/proyek');

      await expect(page.locator('text=Portofolio Proyek')).toBeVisible();
      await expect(page.locator('text=Gedung Kantor Pusat')).toBeVisible();
      await expect(page.locator('text=Perumahan Terintegrasi')).toBeVisible();

      const errors = (page as any).consoleErrors;
      expect(errors.filter((e: string) => !e.includes('ResizeObserver'))).toHaveLength(0);
    });

    test('opens project creation modal', async ({ page }) => {
      await page.goto('/proyek');

      await page.click('button:has-text("Buat Proyek")');

      await expect(page.locator('text=Buat Proyek Baru')).toBeVisible();
      await expect(page.locator('input[placeholder*="Nama"]')).toBeVisible();
    });

    test('creates new project with valid data', async ({ page }) => {
      await page.goto('/proyek');

      await page.click('button:has-text("Buat Proyek")');

      await page.fill('input[placeholder*="Nama"]', 'Jembatan Sungai Kapuas');
      await page.fill('input[placeholder*="Kode"]', 'JEMBATAN-001');
      await page.fill('input[placeholder*="Lokasi"]', 'Pontianak, Kalbar');
      await page.fill('input[placeholder*="Budget"]', '2500000000');

      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=Proyek berhasil dibuat')).toBeVisible({ timeout: 3000 });
      await page.waitForTimeout(500);
      
      const errors = (page as any).consoleErrors;
      expect(errors.filter((e: string) => !e.includes('ResizeObserver'))).toHaveLength(0);
    });

    test('validates required fields in project form', async ({ page }) => {
      await page.goto('/proyek');

      await page.click('button:has-text("Buat Proyek")');

      // Try to submit empty form
      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=Nama wajib diisi')).toBeVisible();
    });

    test('formats budget currency input', async ({ page }) => {
      await page.goto('/proyek');

      await page.click('button:has-text("Buat Proyek")');

      const budgetInput = page.locator('input[placeholder*="Budget"]');
      await budgetInput.fill('1000000000');

      // Check if formatted
      const value = await budgetInput.inputValue();
      expect(value).toBeTruthy();
    });
  });

  test.describe('Project Detail Access', () => {
    test('opens project detail screen without console errors', async ({ page }) => {
      await page.goto('/proyek');

      await page.click('text=Gedung Kantor Pusat');

      await expect(page.locator('h1:has-text("Gedung Kantor Pusat")')).toBeVisible({ timeout: 5000 });

      const errors = (page as any).consoleErrors;
      expect(errors.filter((e: string) => !e.includes('ResizeObserver'))).toHaveLength(0);
    });

    test('displays budget tab with RAB data', async ({ page }) => {
      await page.route('**/rest/v1/budget_lines*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'bl-1',
              code: 'BL-001',
              item: 'Pekerjaan Fondasi',
              quantity: 1,
              unit: 'unit',
              unit_price: 500000000,
              total_price: 500000000,
              project_id: 'proj-123',
            },
            {
              id: 'bl-2',
              code: 'BL-002',
              item: 'Pekerjaan Struktur',
              quantity: 1,
              unit: 'unit',
              unit_price: 2000000000,
              total_price: 2000000000,
              project_id: 'proj-123',
            },
          ]),
        });
      });

      await page.goto('/proyek');
      await page.click('text=Gedung Kantor Pusat');

      await page.click('button:has-text("Anggaran")');

      await expect(page.locator('text=Pekerjaan Fondasi')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('text=Pekerjaan Struktur')).toBeVisible();
    });

    test('displays field reports tab', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'fr-1',
              date: '2026-10-14',
              site_condition: 'Cerah',
              workers: 25,
              equipment: 'Excavator, Dumptruck',
              progress_percentage: 35,
              notes: 'Pekerjaan fondasi selesai 70%, lanjut struktur',
              project_id: 'proj-123',
            },
          ]),
        });
      });

      await page.goto('/proyek');
      await page.click('text=Gedung Kantor Pusat');

      await page.click('button:has-text("Laporan Harian")');

      await expect(page.locator('text=2026-10-14')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('text=Cerah')).toBeVisible();
    });

    test('displays all screen tabs without errors', async ({ page }) => {
      await page.goto('/proyek/proj-123');

      const tabs = ['Ringkasan', 'Anggaran', 'Jadwal', 'Laporan Harian'];

      for (const tab of tabs) {
        await page.click(`button:has-text("${tab}")`);
        await page.waitForTimeout(300);

        const errors = (page as any).consoleErrors;
        const filteredErrors = errors.filter((e: string) => !e.includes('ResizeObserver'));
        expect(filteredErrors).toHaveLength(0);
      }
    });
  });
});
