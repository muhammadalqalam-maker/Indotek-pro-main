import { test, expect } from '@playwright/test';
import {
  authenticateTestPage,
  mockSupabaseRestFallback,
  mockWorkspaceProject,
} from './helpers/authenticatedPage';

test.describe('Petty Cash Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRestFallback(page);
    await mockWorkspaceProject(page);
    await authenticateTestPage(page, { workspaceId: 'ws-test' });
  });

  test('shows the petty-cash workspace for the selected project', async ({ page }) => {
    await page.goto('/anggaran');
    await page.getByRole('tab', { name: /Kas Kecil Site/ }).click();

    await expect(page.getByRole('heading', { name: 'Kas Kecil Lapangan (Petty Cash Site)' })).toBeVisible();
    await expect(page.getByText('Belum Ada Transaksi Kas Kecil')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajukan Kas Kecil' })).toBeVisible();
  });

  test('opens the petty-cash request form', async ({ page }) => {
    await page.goto('/anggaran');
    await page.getByRole('tab', { name: /Kas Kecil Site/ }).click();
    await page.getByRole('button', { name: 'Ajukan Kas Kecil' }).click();

    await expect(page.getByRole('dialog', { name: 'Ajukan Pengeluaran Kas Kecil (Petty Cash)' })).toBeVisible();
  });

  test('blocks petty-cash requests above the configured limit', async ({ page }) => {
    let requestSent = false;
    await page.route('**/rest/v1/rpc/create_petty_cash', async (route) => {
      requestSent = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '"cash-001"' });
    });

    await page.goto('/anggaran');
    await page.getByRole('tab', { name: /Kas Kecil Site/ }).click();
    await page.getByRole('button', { name: 'Ajukan Kas Kecil' }).click();
    await page.locator('#petty-amount').fill('5000001');
    await page.locator('#petty-purpose').fill('Pembelian perlengkapan site');
    await page.locator('#petty-proof').fill('nota-uji.pdf');
    await page.getByRole('button', { name: 'Ajukan Kas Kecil', exact: true }).last().click();

    const rangeOverflow = await page.locator('#petty-amount').evaluate(
      (input: HTMLInputElement) => input.validity.rangeOverflow
    );
    expect(rangeOverflow).toBe(true);
    expect(requestSent).toBe(false);
  });

  test('submits a petty-cash request with Rupiah amount and purpose', async ({ page }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/rpc/create_petty_cash', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '"cash-001"' });
    });

    await page.goto('/anggaran');
    await page.getByRole('tab', { name: /Kas Kecil Site/ }).click();
    await page.getByRole('button', { name: 'Ajukan Kas Kecil' }).click();
    await page.locator('#petty-amount').fill('750000');
    await page.locator('#petty-purpose').fill('Konsumsi lembur pengecoran zona barat');
    await page.locator('#petty-proof').fill('nota-uji.pdf');
    await page.getByRole('button', { name: 'Ajukan Kas Kecil', exact: true }).last().click();

    await expect.poll(() => rpcBody?.p_amount).toBe(750000);
    expect(rpcBody).toMatchObject({
      p_project_id: 'proj-001',
      p_category: 'Konsumsi & Lembur',
      p_description: 'Konsumsi lembur pengecoran zona barat',
    });
  });
});
