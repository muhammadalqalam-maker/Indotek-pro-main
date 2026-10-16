import { test, expect } from '@playwright/test';
import { authenticateTestPage, mockSupabaseRestFallback } from './helpers/authenticatedPage';

test.describe('Invitation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRestFallback(page);
    await authenticateTestPage(page, {
      userId: '00000000-0000-0000-0000-000000000101',
      email: 'owner@example.com',
      fullName: 'Test Owner',
      workspaceId: 'test-workspace-id',
    });
  });

  test('opens the current team invitation form', async ({ page }) => {
    await page.goto('/tim');
    await page.getByRole('button', { name: 'Undang Anggota Tim' }).click();

    const dialog = page.getByRole('dialog', { name: 'Undang Personil Baru ke Workspace' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel(/Nama Lengkap & Gelar/)).toBeVisible();
    await expect(page.getByLabel(/Email Perusahaan/)).toBeVisible();
    await expect(page.getByLabel(/Nomor Induk Pegawai/)).toBeVisible();
  });

  test('submits a valid invitation through the API', async ({ page }) => {
    let requestBody: Record<string, unknown> | undefined;
    await page.route('**/api/invite-member', async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Undangan terkirim', token: 'test-token' }),
      });
    });

    await page.goto('/tim');
    await page.getByRole('button', { name: 'Undang Anggota Tim' }).click();
    await page.getByLabel(/Nama Lengkap & Gelar/).fill('Budi Santoso');
    await page.getByLabel(/Email Perusahaan/).fill('budi@example.com');
    await page.getByLabel(/Nomor Induk Pegawai/).fill('IP-2026-001');
    await page.getByLabel(/Peran Struktural/).selectOption('Project Manager');
    await page.getByLabel(/Departemen \/ Divisi/).fill('Operasional');
    await page.getByRole('button', { name: 'Kirim Undangan & Terbitkan Akun' }).click();

    await expect.poll(() => requestBody?.email).toBe('budi@example.com');
    expect(requestBody).toMatchObject({
      email: 'budi@example.com',
      role: 'project_manager',
      department: 'Operasional',
    });
    expect(requestBody?.workspaceId).toEqual(expect.any(String));
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText('Undangan Dikirim')).toBeVisible();
  });

  test('blocks malformed email before calling the API', async ({ page }) => {
    let requestCount = 0;
    await page.route('**/api/invite-member', async (route) => {
      requestCount += 1;
      await route.fulfill({ status: 400, body: JSON.stringify({ error: 'Invalid email' }) });
    });

    await page.goto('/tim');
    await page.getByRole('button', { name: 'Undang Anggota Tim' }).click();
    await page.getByLabel(/Nama Lengkap & Gelar/).fill('Budi Santoso');
    const email = page.getByLabel(/Email Perusahaan/);
    await email.fill('invalid-email');
    await page.getByLabel(/Nomor Induk Pegawai/).fill('IP-2026-001');
    await page.getByRole('button', { name: 'Kirim Undangan & Terbitkan Akun' }).click();

    expect(await email.evaluate((element) => (element as HTMLInputElement).validity.valid)).toBe(false);
    expect(requestCount).toBe(0);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('shows the API error and keeps the invitation form open', async ({ page }) => {
    await page.route('**/api/invite-member', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Email sudah terdaftar dalam workspace' }),
      });
    });

    await page.goto('/tim');
    await page.getByRole('button', { name: 'Undang Anggota Tim' }).click();
    await page.getByLabel(/Nama Lengkap & Gelar/).fill('Budi Santoso');
    await page.getByLabel(/Email Perusahaan/).fill('existing@example.com');
    await page.getByLabel(/Nomor Induk Pegawai/).fill('IP-2026-002');
    await page.getByRole('button', { name: 'Kirim Undangan & Terbitkan Akun' }).click();

    await expect(page.getByText('Email sudah terdaftar dalam workspace')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('accepts an invitation and shows the successful result', async ({ page }) => {
    let rpcCalls = 0;
    await page.route('**/rest/v1/rpc/accept_invitation', async (route) => {
      rpcCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', logged_in: false, user_id: 'invited-user' }),
      });
    });

    await page.goto('/terima-undangan?token=valid-token');
    await expect(page.getByRole('heading', { name: 'Undangan Diterima!' })).toBeVisible();
    await expect(page.getByRole('paragraph')).toContainText('Undangan berhasil diterima');
    expect(rpcCalls).toBe(1);
  });

  test('shows the pending-approval result as a successful invitation', async ({ page }) => {
    await page.route('**/rest/v1/rpc/accept_invitation', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'pending_approval' }),
      });
    });

    await page.goto('/terima-undangan?token=pending-token');
    await expect(page.getByRole('heading', { name: 'Undangan Diterima!' })).toBeVisible();
    await expect(page.getByRole('paragraph')).toContainText(/menunggu persetujuan administrator/i);
  });

  test('shows the Supabase error when an invitation token is invalid', async ({ page }) => {
    await page.route('**/rest/v1/rpc/accept_invitation', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Token tidak valid atau sudah kedaluwarsa' }),
      });
    });

    await page.goto('/terima-undangan?token=invalid-token');
    await expect(page.getByRole('heading', { name: 'Undangan tidak valid' })).toBeVisible();
    await expect(page.getByRole('paragraph')).toHaveText('Token tidak valid atau sudah kedaluwarsa');
  });

  test('explains when the invitation token is missing', async ({ page }) => {
    await page.goto('/terima-undangan');

    await expect(page.getByRole('heading', { name: 'Undangan tidak valid' })).toBeVisible();
    await expect(page.getByText('Token undangan tidak ditemukan.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
  });
});
