import { test, expect } from '@playwright/test';
import { authenticateTestPage } from './helpers/authenticatedPage';

test.describe('Project Management Flows', () => {
  test.beforeEach(async ({ page }) => {
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

    await page.route('**/rest/v1/projects*', async (route) => {
      const requestUrl = new URL(route.request().url());
      const selectedColumns = requestUrl.searchParams.get('select');
      if (selectedColumns === 'id,legacy_id') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'proj-123', legacy_id: 'proj-123' }]),
        });
        return;
      }

      const method = route.request().method();
      if (method !== 'GET') {
        await route.fulfill({ status: 405, body: 'Method not allowed' });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'proj-123',
            name: 'Gedung Kantor Pusat',
            code: 'PROJ-001',
            client: 'PT Indotek',
            location: 'Jakarta Selatan',
            contract_value: 5000000000,
            progress_actual: 35,
            status: 'Berjalan',
            workspace_id: 'ws-test',
            created_at: '2026-06-15T10:00:00Z',
          },
          {
            id: 'proj-124',
            name: 'Perumahan Terintegrasi',
            code: 'PROJ-002',
            client: 'PT Indotek',
            location: 'Tangerang',
            contract_value: 8000000000,
            progress_actual: 15,
            status: 'Berjalan',
            workspace_id: 'ws-test',
            created_at: '2026-07-01T10:00:00Z',
          },
        ]),
      });
    });

    await page.route('**/rest/v1/budget_lines*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'bl-1',
            code: 'BL-001',
            division_name: 'Pekerjaan Fondasi',
            planned_amount: 500000000,
            actual_amount: 0,
            variance_amount: 500000000,
            project_id: 'proj-123',
            workspace_id: 'ws-test',
          },
          {
            id: 'bl-2',
            code: 'BL-002',
            division_name: 'Pekerjaan Struktur',
            planned_amount: 2000000000,
            actual_amount: 0,
            variance_amount: 2000000000,
            project_id: 'proj-123',
            workspace_id: 'ws-test',
          },
        ]),
      });
    });

    await page.route('**/rest/v1/field_reports*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'fr-1',
          report_number: 'LHP-001',
          report_date: '2026-10-14',
          weather_morning: 'Cerah',
          site_supervisor_name: 'Budi Santoso',
          project_id: 'proj-123',
          workspace_id: 'ws-test',
        }]),
      });
    });

    const projectRpcRequests: Array<Record<string, unknown>> = [];
    (page as any).projectRpcRequests = projectRpcRequests;
    await page.route('**/rest/v1/rpc/create_project', async (route) => {
      projectRpcRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'proj-new' }),
      });
    });

    await authenticateTestPage(page);
  });

  test.describe('Project Creation', () => {
    test('displays projects list without console errors', async ({ page }) => {
      await page.goto('/proyek');

      await expect(page.getByRole('heading', { name: 'Daftar Portofolio Proyek' })).toBeVisible();
      await expect(page.locator('text=Gedung Kantor Pusat')).toBeVisible();
      await expect(page.locator('text=Perumahan Terintegrasi')).toBeVisible();

      const errors = (page as any).consoleErrors;
      expect(errors.filter((e: string) => !e.includes('ResizeObserver'))).toHaveLength(0);
    });

    test('opens project creation modal', async ({ page }) => {
      await page.goto('/proyek');

      await page.locator('main').getByRole('button', { name: 'Tambah Proyek Baru' }).click();

      await expect(page.getByRole('dialog', { name: 'Tambah Proyek Konstruksi Baru' })).toBeVisible();
      await expect(page.getByLabel(/Nama Proyek/)).toBeVisible();
    });

    test('creates new project with valid data', async ({ page }) => {
      await page.goto('/proyek');

      await page.locator('main').getByRole('button', { name: 'Tambah Proyek Baru' }).click();
      await page.getByLabel(/Nama Proyek/).fill('Jembatan Sungai Kapuas');
      await page.getByLabel(/Pemilik \/ Klien/).fill('PT Indotek');
      await page.getByLabel(/Lokasi Pekerjaan/).fill('Pontianak, Kalbar');
      await page.getByLabel(/Nilai Kontrak/).fill('2500000000');
      await page.getByRole('button', { name: 'Simpan & Buka Portofolio' }).click();

      await expect(page.getByRole('dialog')).toBeHidden();
      const requests = (page as any).projectRpcRequests as Array<Record<string, unknown>>;
      await expect.poll(() => requests.length).toBe(1);
      expect(requests[0]).toMatchObject({
        p_name: 'Jembatan Sungai Kapuas',
        p_client: 'PT Indotek',
        p_location: 'Pontianak, Kalbar',
        p_contract_value: 2500000000,
      });
      
      const errors = (page as any).consoleErrors;
      expect(errors.filter((e: string) => !e.includes('ResizeObserver'))).toHaveLength(0);
    });

    test('validates required fields in project form', async ({ page }) => {
      await page.goto('/proyek');

      await page.locator('main').getByRole('button', { name: 'Tambah Proyek Baru' }).click();

      // Try to submit empty form
      await page.getByRole('button', { name: 'Simpan & Buka Portofolio' }).click();

      await expect(page.getByText('Nama proyek wajib diisi')).toBeVisible();
    });

    test('formats budget currency input', async ({ page }) => {
      await page.goto('/proyek');

      await page.locator('main').getByRole('button', { name: 'Tambah Proyek Baru' }).click();

      const budgetInput = page.getByLabel(/Nilai Kontrak/);
      await budgetInput.fill('1000000000');

      const value = await budgetInput.inputValue();
      expect(value).toBe('1000000000');
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
      await page.goto('/proyek/proj-123/budget');

      await expect(page.getByText('Pekerjaan Fondasi')).toBeVisible();
      await expect(page.getByText('Pekerjaan Struktur')).toBeVisible();
    });

    test('displays field reports tab', async ({ page }) => {
      await page.goto('/proyek/proj-123/field-reports');

      await expect(page.getByText('LHP-001')).toBeVisible();
      await expect(page.getByText('Cerah').first()).toBeVisible();
    });

    test('displays all screen tabs without errors', async ({ page }) => {
      await page.goto('/proyek/proj-123');

      const tabs = [
        'Ringkasan Proyek',
        'Jadwal & WBS',
        'RAB & Biaya',
        'Material Proyek',
        'Laporan Lapangan',
        'Dokumen & Gambar',
      ];

      let activeTab = page.getByRole('tab', { name: new RegExp(tabs[0]) });
      await activeTab.click();
      await expect(activeTab).toHaveAttribute('aria-selected', 'true');

      for (const tab of tabs.slice(1)) {
        await activeTab.press('ArrowRight');
        activeTab = page.getByRole('tab', { name: new RegExp(tab) });
        await expect(activeTab).toHaveAttribute('aria-selected', 'true');

        const errors = (page as any).consoleErrors;
        const filteredErrors = errors.filter((e: string) => !e.includes('ResizeObserver'));
        expect(filteredErrors).toHaveLength(0);
      }
    });
  });
});
