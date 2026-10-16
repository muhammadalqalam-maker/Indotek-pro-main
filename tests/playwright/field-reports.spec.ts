import { test, expect } from '@playwright/test';
import {
  authenticateTestPage,
  mockSupabaseRestFallback,
  mockWorkspaceProject,
} from './helpers/authenticatedPage';

test.describe('Field Reports Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRestFallback(page);
    await mockWorkspaceProject(page);
    await page.route('**/rest/v1/field_reports*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'fr-001',
          workspace_id: 'ws-test',
          project_id: 'proj-001',
          projects: { name: 'Gedung Kantor Pusat' },
          report_number: 'LHP-001',
          report_date: '2026-10-15',
          weather_morning: 'Cerah',
          weather_afternoon: 'Berawan',
          working_hours: 8,
          site_supervisor_name: 'Budi Santoso',
          workforce: [{ role: 'Tukang', count: 4 }],
          completed_works: ['Pengecoran lantai dasar'],
          status: 'Draft',
        }]),
      });
    });
    await authenticateTestPage(page, { workspaceId: 'ws-test' });
  });

  test('loads the current daily-report list and selected report', async ({ page }) => {
    await page.goto('/laporan-harian');

    await expect(page.getByRole('heading', { name: 'Laporan Harian & Pengawasan Site' })).toBeVisible();
    await expect(page.getByText('LHP-001', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gedung Kantor Pusat' })).toBeVisible();
    await expect(page.getByText('Budi Santoso').first()).toBeVisible();
  });

  test('opens the daily-report form and exposes its required fields', async ({ page }) => {
    await page.goto('/laporan-harian');
    await page.getByRole('button', { name: 'Buat Laporan Harian' }).click();

    const dialog = page.getByRole('dialog', { name: 'Input Laporan Harian Konstruksi' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Nama Pengawas Lapangan')).toBeVisible();
    await expect(dialog.getByText('Jam Kerja Efektif')).toBeVisible();
    await expect(dialog.getByText('Cuaca Pagi', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Uraian Pekerjaan Terlaksana')).toBeVisible();
  });

  test('submits approval through the authorized RPC', async ({ page }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/rpc/approve_field_report', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });

    await page.goto('/laporan-harian');
    await page.getByRole('button', { name: 'Setujui (PM)' }).click();

    await expect.poll(() => rpcBody?.p_report_id).toBe('fr-001');
    expect(rpcBody?.p_workspace_id).toEqual(expect.any(String));
  });

  test('rejects report hours above 24 before calling the create RPC', async ({ page }) => {
    let requestSent = false;
    await page.route('**/rest/v1/rpc/create_field_report', async (route) => {
      requestSent = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { id: 'fr-new' } }),
      });
    });

    await page.goto('/laporan-harian');
    await page.getByRole('button', { name: 'Buat Laporan Harian' }).click();
    const dialog = page.getByRole('dialog', { name: 'Input Laporan Harian Konstruksi' });
    await dialog.locator('select').nth(1).selectOption('Cerah');
    await dialog.locator('select').nth(2).selectOption('Berawan');
    await dialog.locator('input[type="text"]').nth(0).fill('Pengawas Uji');
    await dialog.locator('input[type="number"]').nth(0).fill('25');
    await dialog.locator('input[type="number"]').nth(1).fill('4');
    await dialog.locator('input[type="number"]').nth(2).fill('2');
    await dialog.locator('textarea').first().fill('Pengecoran area timur');
    await page.getByRole('button', { name: 'Simpan & Terbitkan Laporan' }).click();

    await expect(page.getByText('Data Tenaga Kerja Tidak Valid', { exact: true })).toBeVisible();
    expect(requestSent).toBe(false);
  });

  test('creates a daily report with validated workforce and weather data', async ({ page }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/rpc/create_field_report', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { id: 'fr-new' } }),
      });
    });

    await page.goto('/laporan-harian');
    await page.getByRole('button', { name: 'Buat Laporan Harian' }).click();
    const dialog = page.getByRole('dialog', { name: 'Input Laporan Harian Konstruksi' });
    await dialog.locator('select').nth(1).selectOption('Cerah');
    await dialog.locator('select').nth(2).selectOption('Berawan');
    await dialog.locator('input[type="text"]').nth(0).fill('Pengawas Uji');
    await dialog.locator('input[type="number"]').nth(0).fill('8');
    await dialog.locator('input[type="number"]').nth(1).fill('4');
    await dialog.locator('input[type="number"]').nth(2).fill('2');
    await dialog.locator('textarea').first().fill('Pengecoran area timur');
    await page.getByRole('button', { name: 'Simpan & Terbitkan Laporan' }).click();

    await expect.poll(() => rpcBody?.p_project_id).toBe('proj-001');
    expect(rpcBody).toMatchObject({
      p_site_supervisor_name: 'Pengawas Uji',
      p_weather_morning: 'Cerah',
      p_weather_afternoon: 'Berawan',
      p_working_hours: 8,
      p_workforce: [
        { role: 'Tukang', count: 4 },
        { role: 'Helper / Pekerja', count: 2 },
      ],
      p_completed_works: ['Pengecoran area timur'],
    });
    await expect(dialog).toBeHidden();
  });

  test('filters the report list by its report number', async ({ page }) => {
    await page.goto('/laporan-harian');
    await page.getByPlaceholder('Cari nomor, pengawas, proyek...').fill('LHP-001');

    await expect(page.getByText('LHP-001', { exact: true }).first()).toBeVisible();
  });

  test('limits report photo selection to three files', async ({ page }) => {
    await page.goto('/laporan-harian');
    await page.getByRole('button', { name: 'Buat Laporan Harian' }).click();

    await page.getByRole('dialog', { name: 'Input Laporan Harian Konstruksi' })
      .locator('input[type="file"]')
      .setInputFiles([1, 2, 3, 4].map((number) => ({
        name: `photo-${number}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from('test-image'),
      })));

    await expect(page.getByText('3/3 dipilih')).toBeVisible();
  });
});
