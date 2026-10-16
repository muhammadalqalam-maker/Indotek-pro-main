import { test, expect } from '@playwright/test';
import {
  authenticateTestPage,
  mockSupabaseRestFallback,
  mockWorkspaceProject,
} from './helpers/authenticatedPage';

async function readQueuedReports(page: import('@playwright/test').Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('indotek_offline_db', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('field_reports_queue', 'readonly');
      const items = transaction.objectStore('field_reports_queue').getAll();
      items.onsuccess = () => resolve(items.result);
      items.onerror = () => reject(items.error);
      transaction.oncomplete = () => db.close();
    };
  }));
}

test.describe('Offline Queue Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRestFallback(page);
    await mockWorkspaceProject(page);
    await authenticateTestPage(page);
  });

  test('reports connection loss in the global sync indicator', async ({ page, context }) => {
    await expect(page.getByRole('button', { name: /Tambah Proyek/ }).first()).toBeVisible();
    await context.setOffline(true);

    await expect(page.getByText(/^Offline/)).toBeVisible();
  });

  test('recovers the sync indicator when the connection returns', async ({ page, context }) => {
    await expect(page.getByRole('button', { name: /Tambah Proyek/ }).first()).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText(/^Offline/)).toBeVisible();

    await context.setOffline(false);
    await expect(page.locator('[title="Status Koneksi Normal"]')).toBeVisible();
  });

  test('queues an offline field report and syncs it once connectivity returns', async ({ page, context }) => {
    let rpcBody: Record<string, unknown> | undefined;
    await page.route('**/rest/v1/rpc/create_field_report', async (route) => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { id: 'fr-offline-001' } }),
      });
    });

    await page.goto('/laporan-harian');
    await expect(page.getByRole('heading', { name: 'Laporan Harian & Pengawasan Site' })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText(/^Offline/)).toBeVisible();
    await page.getByRole('button', { name: 'Buat Laporan Harian' }).click();

    const dialog = page.getByRole('dialog', { name: 'Input Laporan Harian Konstruksi' });
    await dialog.locator('select').nth(1).selectOption('Cerah');
    await dialog.locator('select').nth(2).selectOption('Berawan');
    await dialog.locator('input[type="text"]').nth(0).fill('Pengawas Offline');
    await dialog.locator('input[type="number"]').nth(0).fill('8');
    await dialog.locator('input[type="number"]').nth(1).fill('3');
    await dialog.locator('input[type="number"]').nth(2).fill('1');
    await dialog.locator('textarea').first().fill('Pemeriksaan tulangan area barat');
    await page.getByRole('button', { name: 'Simpan & Terbitkan Laporan' }).click();

    await expect.poll(async () => (await readQueuedReports(page)).length).toBe(1);
    const queued = await readQueuedReports(page);
    expect(queued[0]).toMatchObject({
      projectId: 'proj-001',
      siteSupervisor: 'Pengawas Offline',
      status: 'pending',
      completedWorks: ['Pemeriksaan tulangan area barat'],
    });
    expect(rpcBody).toBeUndefined();

    await context.setOffline(false);
    await expect.poll(() => rpcBody?.p_site_supervisor_name).toBe('Pengawas Offline');
    expect(rpcBody?.p_idempotency_key).toEqual(expect.any(String));
    await expect.poll(async () => (await readQueuedReports(page)).length).toBe(0);
  });
});
