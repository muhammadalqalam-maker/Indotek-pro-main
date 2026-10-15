import { test, expect } from '@playwright/test';

test.describe('Import and Export Workflows', () => {
  test.beforeEach(async ({ page }) => {
    // Filter console errors (allow ResizeObserver)
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('ResizeObserver')) {
        throw new Error(`Console error: ${msg.text()}`);
      }
    });

    // Inject auth token
    await page.addInitScript((session) => {
      localStorage.setItem('sb-auth-token', JSON.stringify(session));
    }, {
      access_token: 'mock-token-abc123',
      user: { id: 'user-123', email: 'test@example.com' }
    });

    // Mock auth endpoints
    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ user: { id: 'user-123' } }) });
    });

    // Mock users endpoint
    await page.route('**/rest/v1/users*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([{
          id: 'user-123',
          email: 'test@example.com',
          display_name: 'Test User',
          active_role: 'Site Manager',
          photo_url: null,
          is_verified: true
        }])
      });
    });

    // Mock workspace_members
    await page.route('**/rest/v1/workspace_members*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([{
          id: 'wm-123',
          user_id: 'user-123',
          workspace_id: 'ws-123',
          role: 'Site Manager',
          status: 'Aktif'
        }])
      });
    });

    // Mock projects
    await page.route('**/rest/v1/projects*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([{
          id: 'proj-001',
          name: 'Tower Konstruksi A',
          budget: 5000000000,
          status: 'Aktif',
          start_date: '2024-01-01',
          target_end_date: '2024-12-31'
        }])
      });
    });
  });

  test.describe('Excel BOQ Import', () => {
    test('displays import button in budget screen', async ({ page }) => {
      await page.route('**/rest/v1/budget_lines*', async (route) => {
        await route.fulfill({ status: 200, body: JSON.stringify([]) });
      });

      await page.goto('/projects/proj-001/budget');
      await page.waitForLoadState('networkidle');

      const importButton = page.getByRole('button', { name: /Import Excel BOQ/i });
      await expect(importButton).toBeVisible();
    });

    test('opens file upload dialog on import click', async ({ page }) => {
      await page.route('**/rest/v1/budget_lines*', async (route) => {
        await route.fulfill({ status: 200, body: JSON.stringify([]) });
      });

      await page.goto('/projects/proj-001/budget');
      await page.waitForLoadState('networkidle');

      const importButton = page.getByRole('button', { name: /Import Excel BOQ/i });
      await importButton.click();

      const fileInput = page.locator('input[type="file"][accept*="xlsx"]');
      await expect(fileInput).toBeAttached();
    });

    test('processes valid Excel file and displays preview', async ({ page }) => {
      await page.route('**/rest/v1/budget_lines*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            body: JSON.stringify({
              id: 'bl-new-001',
              project_id: 'proj-001',
              code: '1.1',
              description: 'Pekerjaan Tanah',
              unit: 'm3',
              quantity: 100,
              unit_price: 50000,
              total: 5000000
            })
          });
        } else {
          await route.fulfill({ status: 200, body: JSON.stringify([]) });
        }
      });

      await page.goto('/projects/proj-001/budget');
      await page.waitForLoadState('networkidle');

      const importButton = page.getByRole('button', { name: /Import Excel BOQ/i });
      await importButton.click();

      // Simulate file selection
      const fileInput = page.locator('input[type="file"][accept*="xlsx"]');
      await fileInput.setInputFiles({
        name: 'boq-sample.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from('mock-excel-data')
      });

      // Preview table should show
      const previewTable = page.locator('table').filter({ hasText: 'Pratinjau Import' });
      await expect(previewTable).toBeVisible();
    });

    test('validates Excel file structure before import', async ({ page }) => {
      await page.route('**/rest/v1/budget_lines*', async (route) => {
        await route.fulfill({ status: 200, body: JSON.stringify([]) });
      });

      await page.goto('/projects/proj-001/budget');
      await page.waitForLoadState('networkidle');

      const importButton = page.getByRole('button', { name: /Import Excel BOQ/i });
      await importButton.click();

      // Upload invalid file
      const fileInput = page.locator('input[type="file"][accept*="xlsx"]');
      await fileInput.setInputFiles({
        name: 'invalid.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from('invalid-data')
      });

      // Error toast should appear
      const errorToast = page.locator('[role="alert"]').filter({ hasText: /Format file tidak valid/i });
      await expect(errorToast).toBeVisible();
    });

    test('confirms import and saves to database', async ({ page }) => {
      let importCalled = false;

      await page.route('**/rest/v1/budget_lines*', async (route) => {
        if (route.request().method() === 'POST') {
          importCalled = true;
          await route.fulfill({
            status: 201,
            body: JSON.stringify({
              id: 'bl-batch-001',
              project_id: 'proj-001',
              code: '1.1',
              description: 'Pekerjaan Tanah',
              unit: 'm3',
              quantity: 100,
              unit_price: 50000,
              total: 5000000
            })
          });
        } else {
          await route.fulfill({ status: 200, body: JSON.stringify([]) });
        }
      });

      await page.goto('/projects/proj-001/budget');
      await page.waitForLoadState('networkidle');

      const importButton = page.getByRole('button', { name: /Import Excel BOQ/i });
      await importButton.click();

      const fileInput = page.locator('input[type="file"][accept*="xlsx"]');
      await fileInput.setInputFiles({
        name: 'boq-valid.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from('valid-excel-data')
      });

      // Confirm import
      const confirmButton = page.getByRole('button', { name: /Konfirmasi Import/i });
      await confirmButton.click();

      await page.waitForTimeout(500);

      expect(importCalled).toBe(true);

      // Success toast
      const successToast = page.locator('[role="alert"]').filter({ hasText: /berhasil diimport/i });
      await expect(successToast).toBeVisible();
    });
  });

  test.describe('PDF Export', () => {
    test('displays export button in project detail', async ({ page }) => {
      await page.route('**/rest/v1/budget_lines*', async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify([
            {
              id: 'bl-001',
              project_id: 'proj-001',
              code: '1.1',
              description: 'Pekerjaan Tanah',
              unit: 'm3',
              quantity: 100,
              unit_price: 50000,
              total: 5000000
            }
          ])
        });
      });

      await page.goto('/projects/proj-001/budget');
      await page.waitForLoadState('networkidle');

      const exportButton = page.getByRole('button', { name: /Export PDF/i });
      await expect(exportButton).toBeVisible();
    });

    test('generates PDF for project budget', async ({ page }) => {
      await page.route('**/rest/v1/budget_lines*', async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify([
            {
              id: 'bl-001',
              project_id: 'proj-001',
              code: '1.1',
              description: 'Pekerjaan Tanah',
              unit: 'm3',
              quantity: 100,
              unit_price: 50000,
              total: 5000000
            }
          ])
        });
      });

      await page.goto('/projects/proj-001/budget');
      await page.waitForLoadState('networkidle');

      const downloadPromise = page.waitForEvent('download');

      const exportButton = page.getByRole('button', { name: /Export PDF/i });
      await exportButton.click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    });

    test('exports field report with photos to PDF', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify([
            {
              id: 'fr-001',
              project_id: 'proj-001',
              title: 'Laporan Kemajuan Minggu 1',
              content: 'Pekerjaan galian tanah selesai 50%',
              date: '2024-06-01',
              author_id: 'user-123',
              status: 'Disetujui',
              photo_urls: ['https://storage.example.com/photo1.jpg']
            }
          ])
        });
      });

      await page.goto('/projects/proj-001/field-reports');
      await page.waitForLoadState('networkidle');

      const firstReport = page.locator('tr').filter({ hasText: 'Laporan Kemajuan Minggu 1' }).first();
      await firstReport.click();

      const downloadPromise = page.waitForEvent('download');

      const exportButton = page.getByRole('button', { name: /Export PDF/i });
      await exportButton.click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/laporan.*\.pdf$/i);
    });

    test('exports procurement summary to PDF', async ({ page }) => {
      await page.route('**/rest/v1/purchase_orders*', async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify([
            {
              id: 'po-001',
              project_id: 'proj-001',
              vendor_name: 'PT Suplai Material',
              total_amount: 15000000,
              status: 'Disetujui',
              created_at: '2024-06-01T10:00:00Z'
            }
          ])
        });
      });

      await page.goto('/procurement');
      await page.waitForLoadState('networkidle');

      const downloadPromise = page.waitForEvent('download');

      const exportButton = page.getByRole('button', { name: /Export PDF/i });
      await exportButton.click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/procurement.*\.pdf$/i);
    });
  });
});
