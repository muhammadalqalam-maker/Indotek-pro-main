import { test, expect } from '@playwright/test';
import {
  authenticateTestPage,
  mockSupabaseRestFallback,
  mockWorkspaceMaterial,
  mockWorkspaceProject,
} from './helpers/authenticatedPage';

test.describe('Materials Stock Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRestFallback(page);
    await mockWorkspaceProject(page);
    await mockWorkspaceMaterial(page);
    await authenticateTestPage(page, { workspaceId: 'ws-test' });
  });

  test('loads the current inventory screen and its stock tabs', async ({ page }) => {
    await page.goto('/material');

    await expect(page.getByRole('heading', { name: 'Inventaris & Pengendalian Material' })).toBeVisible();
    await expect(page.getByText('MAT-001', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Semen Portland').first()).toBeVisible();
    await expect(page.getByText('50 sak', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /Inventori Stok/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Log Mutasi Surat Jalan/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Penyesuaian Opname Fisik/ })).toBeVisible();
  });

  test('opens the stock-mutation form', async ({ page }) => {
    await page.goto('/material');
    await page.getByRole('button', { name: 'Input Mutasi Material' }).click();

    await expect(page.getByRole('dialog', { name: 'Catat Mutasi Material (Surat Jalan)' })).toBeVisible();
  });

  test('opens the physical stock-adjustment form', async ({ page }) => {
    await page.goto('/material');
    await page.getByRole('button', { name: 'Ajukan Opname / Koreksi' }).click();

    await expect(page.getByRole('dialog', { name: 'Pengajuan Koreksi Stok / Opname Fisik' })).toBeVisible();
  });

  test('blocks outgoing stock mutations that exceed available stock', async ({ page }) => {
    let mutationSubmitted = false;
    await page.route('**/rest/v1/rpc/create_stock_mutation', async (route) => {
      mutationSubmitted = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });

    await page.goto('/material');
    await page.getByRole('button', { name: 'Input Mutasi Material' }).click();
    await page.locator('#mutation-qty-input').fill('51');
    await page.getByRole('button', { name: 'Simpan Mutasi Stok' }).click();

    await expect(page.getByText('Stok tidak mencukupi! Tersedia hanya 50 sak.')).toBeVisible();
    expect(mutationSubmitted).toBe(false);
  });

  test('submits an outgoing mutation through the stock RPC', async ({ page }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/rpc/create_stock_mutation', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });

    await page.goto('/material');
    await page.getByRole('button', { name: 'Input Mutasi Material' }).click();
    await page.locator('#mutation-qty-input').fill('12');
    await page.locator('#mutation-ref-input').fill('SJ-TEST-001');
    await page.getByRole('button', { name: 'Simpan Mutasi Stok' }).click();

    await expect.poll(() => rpcBody?.p_material_id).toBe('00000000-0000-4000-8000-000000000010');
    expect(rpcBody).toMatchObject({
      p_type: 'OUT',
      p_quantity: 12,
      p_reference_no: 'SJ-TEST-001',
    });
  });

  test('submits an incoming stock mutation with the inbound RPC type', async ({ page }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/rpc/create_stock_mutation', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });

    await page.goto('/material');
    await page.getByRole('button', { name: 'Input Mutasi Material' }).click();
    await page.locator('#mutation-type-select').selectOption('Masuk');
    await page.locator('#mutation-qty-input').fill('5');
    await page.getByRole('button', { name: 'Simpan Mutasi Stok' }).click();

    await expect.poll(() => rpcBody?.p_type).toBe('IN');
    expect(rpcBody?.p_quantity).toBe(5);
  });

  test('submits a physical stock adjustment with the calculated system quantity', async ({ page }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/rpc/create_stock_adjustment', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });

    await page.goto('/material');
    await expect(page.getByText('50 sak', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Ajukan Opname / Koreksi' }).click();
    await page.locator('#adj-phys-stock').fill('45');
    await page.getByRole('button', { name: 'Kirim untuk Persetujuan' }).click();

    await expect.poll(() => rpcBody?.p_material_id).toBe('00000000-0000-4000-8000-000000000010');
    expect(rpcBody).toMatchObject({
      p_physical_stock: 45,
      p_reason: 'Kerusakan Fisik di Site',
    });
  });

  test('loads pending stock adjustments and approves them through the review RPC', async ({ page }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/stock_adjustments*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'adjustment-001',
          workspace_id: 'ws-test',
          project_id: 'proj-001',
          material_id: '00000000-0000-4000-8000-000000000010',
          adjustment_no: 'ADJ-001',
          previous_stock: 50,
          physical_stock: 45,
          variance_quantity: -5,
          reason: 'Selisih hasil opname',
          evidence_ref: 'BA-001',
          status: 'Menunggu',
          submitted_by_name: 'Petugas Gudang',
          submitted_by: 'user-warehouse',
          submitted_at: '2026-10-15T08:00:00.000Z',
          created_at: '2026-10-15T08:00:00.000Z',
          materials: { name: 'Semen Portland', code: 'MAT-001', unit: 'sak', legacy_id: null },
          projects: { name: 'Gedung Kantor Pusat', legacy_id: null },
        }]),
      });
    });
    await page.route('**/rest/v1/rpc/decide_stock_adjustment', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });

    await page.goto('/material');
    await page.getByRole('tab', { name: /Penyesuaian Opname Fisik/ }).click();
    await expect(page.getByText('ADJ-001')).toBeVisible();
    await expect(page.getByText('Selisih hasil opname')).toBeVisible();
    await page.getByRole('button', { name: 'Setujui' }).click();

    await expect.poll(() => rpcBody?.p_adjustment_id).toBe('adjustment-001');
    expect(rpcBody).toMatchObject({
      p_decision: 'approve',
      p_notes: null,
    });
  });

  test('does not request an adjustment when physical and system stock match', async ({ page }) => {
    let requestSent = false;
    await page.route('**/rest/v1/rpc/create_stock_adjustment', async (route) => {
      requestSent = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });

    await page.goto('/material');
    await expect(page.getByText('50 sak', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Ajukan Opname / Koreksi' }).click();
    await page.locator('#adj-phys-stock').fill('50');
    await page.getByRole('button', { name: 'Kirim untuk Persetujuan' }).click();

    await expect(page.getByText(/tidak ada selisih/)).toBeVisible();
    expect(requestSent).toBe(false);
  });
});
