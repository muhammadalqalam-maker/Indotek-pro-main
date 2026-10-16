import { test, expect } from '@playwright/test';
import {
  authenticateTestPage,
  mockSupabaseRestFallback,
  mockWorkspaceProject,
} from './helpers/authenticatedPage';

test.describe('Procurement Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRestFallback(page);
    await mockWorkspaceProject(page);
    await authenticateTestPage(page, { workspaceId: 'ws-test' });
  });

  test('loads the current purchase-order screen', async ({ page }) => {
    await page.goto('/pengadaan');

    await expect(page.getByRole('heading', { name: 'Pengadaan & Purchase Order (PO)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buat SPP Pengadaan' })).toBeVisible();
  });

  test('opens the SPP form with its current fields', async ({ page }) => {
    await page.goto('/pengadaan');
    await page.getByRole('button', { name: 'Buat SPP Pengadaan' }).click();

    const dialog = page.getByRole('dialog', { name: 'Buat Surat Permintaan Pengadaan (SPP)' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Pilih Proyek Pemohon', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Nama Vendor / Supplier', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Deskripsi Item Material', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Estimasi Total Biaya (IDR)', { exact: true })).toBeVisible();
  });

  test('requires purchase details before submitting an SPP', async ({ page }) => {
    await page.goto('/pengadaan');
    await page.getByRole('button', { name: 'Buat SPP Pengadaan' }).click();
    await page.getByRole('button', { name: 'Kirim untuk Persetujuan' }).click();

    await expect(page.getByText('Data Belum Lengkap', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Buat Surat Permintaan Pengadaan (SPP)' })).toBeVisible();
  });

  test('rejects fractional Rupiah amounts without submitting an SPP', async ({ page }) => {
    let requestSent = false;
    await page.route('**/rest/v1/rpc/create_purchase_order', async (route) => {
      requestSent = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '"po-001"' });
    });

    await page.goto('/pengadaan');
    await page.getByRole('button', { name: 'Buat SPP Pengadaan' }).click();
    const dialog = page.getByRole('dialog', { name: 'Buat Surat Permintaan Pengadaan (SPP)' });
    const inputs = dialog.locator('input');
    await inputs.nth(0).fill('PT Vendor Uji');
    await inputs.nth(1).fill('1000.50');
    await inputs.nth(2).fill('Besi beton');
    await inputs.nth(3).fill('100 kg');
    await page.getByRole('button', { name: 'Kirim untuk Persetujuan' }).click();

    await expect(page.getByText('Biaya Tidak Valid', { exact: true })).toBeVisible();
    expect(requestSent).toBe(false);
  });

  test('creates an SPP using the validated procurement RPC contract', async ({ page }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/rpc/create_purchase_order', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '"po-001"' });
    });

    await page.goto('/pengadaan');
    await page.getByRole('button', { name: 'Buat SPP Pengadaan' }).click();
    const dialog = page.getByRole('dialog', { name: 'Buat Surat Permintaan Pengadaan (SPP)' });
    const inputs = dialog.locator('input');
    await inputs.nth(0).fill('PT Vendor Uji');
    await inputs.nth(1).fill('4500000');
    await inputs.nth(2).fill('Besi beton ulir');
    await inputs.nth(3).fill('100 kg');
    await inputs.nth(4).fill('2026-11-15');
    await page.getByRole('button', { name: 'Kirim untuk Persetujuan' }).click();

    await expect.poll(() => rpcBody?.p_supplier_name).toBe('PT Vendor Uji');
    expect(rpcBody).toMatchObject({
      p_project_id: 'proj-001',
      p_item_description: 'Besi beton ulir',
      p_quantity_summary: '100 kg',
      p_total_cost: 4500000,
      p_target_delivery_date: '2026-11-15',
    });
  });

  test('keeps the SPP form open and reports a server-side failure', async ({ page }) => {
    await page.route('**/rest/v1/rpc/create_purchase_order', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Approval service unavailable' }),
      });
    });

    await page.goto('/pengadaan');
    await page.getByRole('button', { name: 'Buat SPP Pengadaan' }).click();
    const dialog = page.getByRole('dialog', { name: 'Buat Surat Permintaan Pengadaan (SPP)' });
    const inputs = dialog.locator('input');
    await inputs.nth(0).fill('PT Vendor Uji');
    await inputs.nth(1).fill('4500000');
    await inputs.nth(2).fill('Besi beton ulir');
    await inputs.nth(3).fill('100 kg');
    await inputs.nth(4).fill('2026-11-15');
    await page.getByRole('button', { name: 'Kirim untuk Persetujuan' }).click();

    await expect(page.getByText('Gagal Membuat PO', { exact: true })).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});
