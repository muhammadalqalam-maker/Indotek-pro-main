import { test, expect } from '@playwright/test';
import {
  authenticateTestPage,
  mockSupabaseRestFallback,
  mockWorkspaceProject,
} from './helpers/authenticatedPage';

test.describe('BOQ Import and Export Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRestFallback(page);
    await mockWorkspaceProject(page);
    await authenticateTestPage(page, { workspaceId: 'ws-test' });
  });

  test('shows the current Excel import and template actions', async ({ page }) => {
    await page.goto('/anggaran');

    await expect(page.getByRole('tab', { name: /BOQ & RAB Rinci/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Impor Excel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Template Excel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tambah Item BOQ' })).toBeVisible();
  });

  test('opens the current BOQ item editor', async ({ page }) => {
    await page.goto('/anggaran');
    await page.getByRole('button', { name: 'Tambah Item BOQ' }).click();

    await expect(page.getByRole('heading', { name: 'Tambah Item Pekerjaan BOQ' })).toBeVisible();
    await expect(page.getByText(/Kode Item/)).toBeVisible();
    await expect(page.getByText(/Uraian Pekerjaan/).last()).toBeVisible();
  });

  test('downloads a ready-to-fill BOQ template', async ({ page }) => {
    await page.goto('/anggaran');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Template Excel' }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/BOQ|RAB|Template/i);
  });

  test('imports valid BOQ CSV rows through the security-definer RPC', async ({ page }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/rpc/upsert_boq_item', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, id: 'boq-001', message: 'Item BOQ tersimpan.' }),
      });
    });

    await page.goto('/anggaran');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'boq-uji.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'Kategori Divisi,Kode Item,Uraian Pekerjaan,Satuan,Volume,Harga Satuan (Rp)\n' +
        'Pekerjaan Struktur,STR-001,Pengecoran kolom,m3,2,1000000'
      ),
    });

    await expect.poll(() => rpcBody?.p_kode).toBe('STR-001');
    expect(rpcBody).toMatchObject({
      p_project_id: 'proj-001',
      p_uraian: 'Pengecoran kolom',
      p_satuan: 'm3',
      p_volume: 2,
      p_harga_satuan: 1000000,
      p_division_category: 'Pekerjaan Struktur',
    });
  });

  test('rejects an unrecognized BOQ file without writing items', async ({ page }) => {
    let requestSent = false;
    await page.route('**/rest/v1/rpc/upsert_boq_item', async (route) => {
      requestSent = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/anggaran');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'invalid-boq.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Kolom A,Kolom B\nsatu,dua'),
    });

    await expect(page.getByText(/Header tabel tidak dikenali/)).toBeVisible();
    expect(requestSent).toBe(false);
  });
});
