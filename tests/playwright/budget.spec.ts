import { test, expect } from '@playwright/test';
import {
  authenticateTestPage,
  mockSupabaseRestFallback,
  mockWorkspaceProject,
} from './helpers/authenticatedPage';

test.describe('Budget Workflows (RAB)', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRestFallback(page);
    await mockWorkspaceProject(page);
    await authenticateTestPage(page, { workspaceId: 'ws-test' });
  });

  test('loads the current budget workspace and its feature tabs', async ({ page }) => {
    await page.goto('/anggaran');

    await expect(page.getByRole('heading', { name: 'Pengendalian Anggaran & Kas Proyek' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /BOQ & RAB Rinci/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Rekap Divisi Pagu/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Addendum Revisi Anggaran/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Kas Kecil Site/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Jadwal Termin/ })).toBeVisible();
  });

  test('opens the add-RAB form from the division summary tab', async ({ page }) => {
    await page.goto('/anggaran');
    await page.getByRole('tab', { name: /Rekap Divisi Pagu/ }).click();
    await page.getByRole('button', { name: 'Tambah Pos RAB', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Tambah Pos RAB / BOQ Baru' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Kode Pos RAB')).toBeVisible();
    await expect(dialog.getByLabel('Uraian / Divisi Pekerjaan')).toBeVisible();
    await expect(dialog.getByLabel('Satuan Unit')).toBeVisible();
  });

  test('opens the petty-cash request form from its tab', async ({ page }) => {
    await page.goto('/anggaran');
    await page.getByRole('tab', { name: /Kas Kecil Site/ }).click();
    await page.getByRole('button', { name: 'Ajukan Kas Kecil' }).click();

    await expect(page.getByRole('dialog', { name: 'Ajukan Pengeluaran Kas Kecil (Petty Cash)' })).toBeVisible();
  });

  test('requires the RAB line fields before saving', async ({ page }) => {
    let requestSent = false;
    await page.route('**/rest/v1/rpc/add_budget_line', async (route) => {
      requestSent = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '"line-001"' });
    });

    await page.goto('/anggaran');
    await page.getByRole('tab', { name: /Rekap Divisi Pagu/ }).click();
    await page.getByRole('button', { name: 'Tambah Pos RAB', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Tambah Pos RAB / BOQ Baru' });
    await page.getByRole('button', { name: 'Simpan Pos RAB' }).click();

    await expect(dialog).toBeVisible();
    expect(requestSent).toBe(false);
  });

  test('saves a RAB line with derived amount fields through the RPC', async ({ page }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/rpc/add_budget_line', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '"line-001"' });
    });

    await page.goto('/anggaran');
    await page.getByRole('tab', { name: /Rekap Divisi Pagu/ }).click();
    await page.getByRole('button', { name: 'Tambah Pos RAB', exact: true }).click();
    await page.locator('#line-form-code').fill('DIV-TEST');
    await page.locator('#line-form-div').fill('Pekerjaan uji beton');
    await page.locator('#line-form-unit').fill('m3');
    await page.locator('#line-form-vol').fill('2.5');
    await page.locator('#line-form-rate').fill('1000000');
    await page.locator('#line-form-act').fill('250000');
    await page.getByRole('button', { name: 'Simpan Pos RAB' }).click();

    await expect.poll(() => rpcBody?.p_project_id).toBe('proj-001');
    expect(rpcBody).toMatchObject({
      p_line_data: expect.objectContaining({
        code: 'DIV-TEST',
        divisionName: 'Pekerjaan uji beton',
        volume: 2.5,
        unitRate: 1000000,
        plannedAmount: 2500000,
        actualAmount: 250000,
        varianceAmount: 2250000,
      }),
    });
  });

  test('submits a budget revision with the original and proposed values', async ({ page }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/rpc/create_budget_revision', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '"revision-001"' });
    });

    await page.goto('/anggaran');
    await page.getByRole('tab', { name: /Addendum Revisi Anggaran/ }).click();
    await page.getByRole('button', { name: 'Ajukan Revisi Anggaran' }).click();
    await page.locator('#rev-form-title').fill('Penyesuaian biaya material');
    await page.locator('#rev-form-orig').fill('10000000');
    await page.locator('#rev-form-prop').fill('12500000');
    await page.locator('#rev-form-just').fill('Penyesuaian sesuai harga pasar terbaru.');
    await page.getByRole('dialog', { name: 'Ajukan Addendum Revisi Anggaran' })
      .getByRole('button', { name: 'Ajukan Addendum', exact: true })
      .click();

    await expect.poll(() => rpcBody?.p_project_id).toBe('proj-001');
    expect(rpcBody).toMatchObject({
      p_division_name: 'Pekerjaan Struktur',
      p_original_amount: 10000000,
      p_revised_amount: 12500000,
      p_reason: 'Penyesuaian sesuai harga pasar terbaru.',
    });
  });
});
