import { test, expect } from '@playwright/test';

test.describe('Petty Cash Workflows', () => {
  test.beforeEach(async ({ page }) => {
    // Monitor console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter out benign ResizeObserver errors
        if (!text.includes('ResizeObserver')) {
          errors.push(text);
        }
      }
    });

    // Store errors for later checks
    (page as any)._consoleErrors = errors;

    // Inject auth token
    await page.addInitScript((session) => {
      localStorage.setItem('sb-access-token', session.access_token);
      localStorage.setItem('sb-refresh-token', 'mock-refresh-token');
    }, { access_token: 'mock-token' });

    // Mock auth endpoints
    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: '00000000-0000-0000-0000-000000000001', email: 'user@example.com' },
          session: { access_token: 'mock-token' },
        }),
      });
    });

    // Mock user profile
    await page.route('**/rest/v1/users*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '00000000-0000-0000-0000-000000000001',
            email: 'user@example.com',
            display_name: 'Test User',
          },
        ]),
      });
    });

    // Mock workspace members
    await page.route('**/rest/v1/workspace_members*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'wm-001',
            user_id: '00000000-0000-0000-0000-000000000001',
            role: 'Admin',
            status: 'Aktif',
          },
        ]),
      });
    });

    // Mock projects
    await page.route('**/rest/v1/projects*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'proj-001',
            project_name: 'Test Project',
            location: 'Jakarta',
            estimated_budget: 1000000000n,
            start_date: '2026-01-01',
            status: 'Aktif',
          },
        ]),
      });
    });
  });

  test.describe('Petty Cash Submission', () => {
    test('displays petty cash list without console errors', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'pc-001',
              project_id: 'proj-001',
              category: 'ATK',
              description: 'Pembelian kertas A4',
              requested_amount: 150000n,
              status: 'Menunggu Persetujuan',
              created_at: '2026-10-15T10:00:00Z',
            },
          ]),
        });
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');

      await expect(page.locator('text=Pembelian kertas A4')).toBeVisible();
      await expect(page.locator('text=Rp150.000')).toBeVisible();
      await expect(page.locator('text=Menunggu Persetujuan')).toBeVisible();

      const errors = (page as any)._consoleErrors;
      expect(errors.length).toBe(0);
    });

    test('opens petty cash submission modal', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');
      await page.click('text=Ajukan Kas Kecil');

      await expect(page.locator('text=Ajukan Kas Kecil')).toBeVisible();
      await expect(page.locator('text=Kategori')).toBeVisible();
      await expect(page.locator('text=Jumlah')).toBeVisible();
      await expect(page.locator('text=Deskripsi')).toBeVisible();
    });

    test('submits petty cash request with valid data', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'pc-002',
              project_id: 'proj-001',
              category: 'ATK',
              description: 'Pembelian bolpoin',
              requested_amount: 50000n,
              status: 'Menunggu Persetujuan',
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        }
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');
      await page.click('text=Ajukan Kas Kecil');

      await page.selectOption('select[name="category"]', 'ATK');
      await page.fill('input[name="amount"]', '50000');
      await page.fill('textarea[name="description"]', 'Pembelian bolpoin');
      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=berhasil')).toBeVisible();
    });

    test('validates required fields in petty cash form', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');
      await page.click('text=Ajukan Kas Kecil');

      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=wajib diisi')).toBeVisible({ timeout: 5000 });
    });

    test('validates minimum amount', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');
      await page.click('text=Ajukan Kas Kecil');

      await page.selectOption('select[name="category"]', 'ATK');
      await page.fill('input[name="amount"]', '0');
      await page.fill('textarea[name="description"]', 'Test');
      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=harus lebih besar dari 0')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Petty Cash Approval Workflow', () => {
    test('approves petty cash request with valid role', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'pc-003',
              project_id: 'proj-001',
              category: 'ATK',
              description: 'Pembelian kertas',
              requested_amount: 100000n,
              status: 'Menunggu Persetujuan',
              created_by: '00000000-0000-0000-0000-000000000002',
            },
          ]),
        });
      });

      await page.route('**/rest/v1/rpc/approve_petty_cash', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');
      await page.click('text=Pembelian kertas');
      await page.click('button:has-text("Setujui")');

      await expect(page.locator('text=berhasil disetujui')).toBeVisible();
    });

    test('rejects petty cash request with reason', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'pc-004',
              project_id: 'proj-001',
              category: 'ATK',
              description: 'Pembelian kertas',
              requested_amount: 100000n,
              status: 'Menunggu Persetujuan',
              created_by: '00000000-0000-0000-0000-000000000002',
            },
          ]),
        });
      });

      await page.route('**/rest/v1/rpc/reject_petty_cash', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');
      await page.click('text=Pembelian kertas');
      await page.click('button:has-text("Tolak")');

      await page.fill('textarea[name="rejection_reason"]', 'Tidak sesuai anggaran');
      await page.click('button:has-text("Konfirmasi")');

      await expect(page.locator('text=berhasil ditolak')).toBeVisible();
    });

    test('prevents approval by same user who created request (SoD violation)', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'pc-005',
              project_id: 'proj-001',
              category: 'ATK',
              description: 'Pembelian kertas',
              requested_amount: 100000n,
              status: 'Menunggu Persetujuan',
              created_by: '00000000-0000-0000-0000-000000000001', // Same as current user
            },
          ]),
        });
      });

      await page.route('**/rest/v1/rpc/approve_petty_cash', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Separation of Duties violation: cannot approve own petty cash request',
          }),
        });
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');
      await page.click('text=Pembelian kertas');
      await page.click('button:has-text("Setujui")');

      await expect(page.locator('text=Separation of Duties violation')).toBeVisible();
    });

    test('displays audit trail for petty cash actions', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'pc-006',
              project_id: 'proj-001',
              category: 'ATK',
              description: 'Pembelian kertas',
              requested_amount: 100000n,
              status: 'Disetujui',
              created_by: '00000000-0000-0000-0000-000000000002',
              approved_by: '00000000-0000-0000-0000-000000000001',
              approved_at: '2026-10-15T11:00:00Z',
            },
          ]),
        });
      });

      await page.route('**/rest/v1/audit_logs*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'audit-001',
              action: 'petty_cash_approved',
              actor_id: '00000000-0000-0000-0000-000000000001',
              actor_name: 'Admin User',
              timestamp: '2026-10-15T11:00:00Z',
              details: { petty_cash_id: 'pc-006', amount: 100000n },
            },
          ]),
        });
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');
      await page.click('text=Pembelian kertas');

      await expect(page.locator('text=Riwayat')).toBeVisible();
      await expect(page.locator('text=Admin User')).toBeVisible();
      await expect(page.locator('text=petty_cash_approved')).toBeVisible();
    });
  });

  test.describe('Petty Cash Disbursement', () => {
    test('marks petty cash as disbursed', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'pc-007',
              project_id: 'proj-001',
              category: 'ATK',
              description: 'Pembelian kertas',
              requested_amount: 100000n,
              status: 'Disetujui',
            },
          ]),
        });
      });

      await page.route('**/rest/v1/rpc/disburse_petty_cash', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');
      await page.click('text=Pembelian kertas');
      await page.click('button:has-text("Cairkan")');

      await expect(page.locator('text=berhasil dicairkan')).toBeVisible();
    });

    test('displays disbursement date', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'pc-008',
              project_id: 'proj-001',
              category: 'ATK',
              description: 'Pembelian kertas',
              requested_amount: 100000n,
              status: 'Dicairkan',
              disbursed_at: '2026-10-15T12:00:00Z',
            },
          ]),
        });
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');

      await expect(page.locator('text=Dicairkan')).toBeVisible();
      await expect(page.locator('text=15 Okt 2026')).toBeVisible();
    });
  });

  test.describe('Petty Cash Filtering', () => {
    test('filters petty cash by category', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        const url = new URL(route.request().url());
        const category = url.searchParams.get('category');

        if (category === 'ATK') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'pc-009',
                category: 'ATK',
                description: 'Pembelian kertas',
                requested_amount: 100000n,
                status: 'Menunggu Persetujuan',
              },
            ]),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'pc-009',
                category: 'ATK',
                description: 'Pembelian kertas',
                requested_amount: 100000n,
                status: 'Menunggu Persetujuan',
              },
              {
                id: 'pc-010',
                category: 'Transportasi',
                description: 'Bensin kendaraan proyek',
                requested_amount: 200000n,
                status: 'Disetujui',
              },
            ]),
          });
        }
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');

      await expect(page.locator('text=Pembelian kertas')).toBeVisible();
      await expect(page.locator('text=Bensin kendaraan proyek')).toBeVisible();

      await page.selectOption('select[name="category"]', 'ATK');

      await expect(page.locator('text=Pembelian kertas')).toBeVisible();
      await expect(page.locator('text=Bensin kendaraan proyek')).not.toBeVisible();
    });

    test('filters petty cash by status', async ({ page }) => {
      await page.route('**/rest/v1/petty_cash*', async (route) => {
        const url = new URL(route.request().url());
        const status = url.searchParams.get('status');

        if (status === 'Menunggu Persetujuan') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'pc-011',
                category: 'ATK',
                description: 'Pembelian kertas',
                requested_amount: 100000n,
                status: 'Menunggu Persetujuan',
              },
            ]),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'pc-011',
                category: 'ATK',
                description: 'Pembelian kertas',
                requested_amount: 100000n,
                status: 'Menunggu Persetujuan',
              },
              {
                id: 'pc-012',
                category: 'ATK',
                description: 'Pembelian bolpoin',
                requested_amount: 50000n,
                status: 'Disetujui',
              },
            ]),
          });
        }
      });

      await page.goto('/anggaran');
      await page.click('text=Kas Kecil');

      await expect(page.locator('text=Pembelian kertas')).toBeVisible();
      await expect(page.locator('text=Pembelian bolpoin')).toBeVisible();

      await page.selectOption('select[name="status"]', 'Menunggu Persetujuan');

      await expect(page.locator('text=Pembelian kertas')).toBeVisible();
      await expect(page.locator('text=Pembelian bolpoin')).not.toBeVisible();
    });
  });
});
