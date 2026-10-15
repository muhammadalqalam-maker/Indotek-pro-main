import { test, expect } from '@playwright/test';

test.describe('Procurement Workflows with SoD', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    (page as any).consoleErrors = consoleErrors;

    // Authenticated session
    await page.addInitScript((session) => {
      localStorage.setItem('sb-mock-auth-token', JSON.stringify(session));
    }, {
      access_token: 'mock-token',
      user: { id: '00000000-0000-0000-0000-000000000001' },
    });

    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: '00000000-0000-0000-0000-000000000001' },
          session: { access_token: 'mock-token' },
        }),
      });
    });

    await page.route('**/rest/v1/users*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: '00000000-0000-0000-0000-000000000001',
          email: 'approver@indotek.com',
          name: 'Budget Approver',
          role: 'Finance',
          workspace_id: 'ws-test',
          is_onboarding_complete: true,
        }]),
      });
    });

    await page.route('**/rest/v1/workspace_members*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'member-1',
          user_id: '00000000-0000-0000-0000-000000000001',
          workspace_id: 'ws-test',
          email: 'approver@indotek.com',
          name: 'Budget Approver',
          role: 'Finance',
          status: 'Aktif',
        }]),
      });
    });

    await page.route('**/rest/v1/projects*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'proj-001',
          name: 'Gedung Kantor Pusat',
          code: 'GKP-2026',
          location: 'Jakarta Selatan',
          budget: 500000000000n,
          workspace_id: 'ws-test',
        }]),
      });
    });
  });

  test.describe('PO Creation', () => {
    test('displays PO list without console errors', async ({ page }) => {
      await page.route('**/rest/v1/purchase_orders*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'po-001',
              po_number: 'PO-2026-001',
              project_id: 'proj-001',
              vendor_name: 'PT Semen Indonesia',
              total_amount: 150000000n,
              status: 'Draft',
              created_at: '2026-10-01T00:00:00Z',
              workspace_id: 'ws-test',
            },
            {
              id: 'po-002',
              po_number: 'PO-2026-002',
              project_id: 'proj-001',
              vendor_name: 'PT Baja Konstruksi',
              total_amount: 250000000n,
              status: 'Menunggu Persetujuan',
              created_at: '2026-10-05T00:00:00Z',
              workspace_id: 'ws-test',
            },
          ]),
        });
      });

      await page.goto('/procurement');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('Procurement');
      await expect(page.locator('text=PO-2026-001')).toBeVisible();
      await expect(page.locator('text=PT Semen Indonesia')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });

    test('creates new PO with valid data', async ({ page }) => {
      await page.route('**/rest/v1/purchase_orders*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        } else if (route.request().method() === 'POST') {
          const postData = route.request().postDataJSON();
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'po-new',
              po_number: 'PO-2026-003',
              ...postData,
              status: 'Draft',
              created_at: new Date().toISOString(),
            }),
          });
        }
      });

      await page.goto('/procurement');
      await page.click('button:has-text("Buat PO")');

      await expect(page.locator('text=Tambah Purchase Order')).toBeVisible();

      await page.fill('input[name="vendor_name"]', 'PT Material Utama');
      await page.fill('input[name="total_amount"]', '180000000');
      await page.fill('textarea[name="description"]', 'Material pasir dan kerikil');
      await page.selectOption('select[name="project_id"]', 'proj-001');

      await page.click('button:has-text("Simpan")');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=PO-2026-003')).toBeVisible();
      await expect(page.locator('text=PT Material Utama')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });

    test('validates required fields on PO creation', async ({ page }) => {
      await page.route('**/rest/v1/purchase_orders*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/procurement');
      await page.click('button:has-text("Buat PO")');

      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=Nama vendor wajib diisi')).toBeVisible();
      await expect(page.locator('text=Total amount wajib diisi')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });
  });

  test.describe('PO Approval with SoD', () => {
    test('approves PO with valid approver role', async ({ page }) => {
      await page.route('**/rest/v1/purchase_orders*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'po-002',
            po_number: 'PO-2026-002',
            project_id: 'proj-001',
            vendor_name: 'PT Baja Konstruksi',
            total_amount: 250000000n,
            status: 'Menunggu Persetujuan',
            created_at: '2026-10-05T00:00:00Z',
            created_by: 'user-other',
            workspace_id: 'ws-test',
          }]),
        });
      });

      await page.route('**/rest/v1/rpc/approve_purchase_order', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/procurement');
      await page.click('text=PO-2026-002');

      await expect(page.locator('text=Menunggu Persetujuan')).toBeVisible();
      await page.click('button:has-text("Setujui")');

      await expect(page.locator('text=PO berhasil disetujui')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });

    test('rejects PO with reason', async ({ page }) => {
      await page.route('**/rest/v1/purchase_orders*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'po-002',
            po_number: 'PO-2026-002',
            project_id: 'proj-001',
            vendor_name: 'PT Baja Konstruksi',
            total_amount: 250000000n,
            status: 'Menunggu Persetujuan',
            created_at: '2026-10-05T00:00:00Z',
            created_by: 'user-other',
            workspace_id: 'ws-test',
          }]),
        });
      });

      await page.route('**/rest/v1/rpc/reject_purchase_order', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/procurement');
      await page.click('text=PO-2026-002');

      await page.click('button:has-text("Tolak")');

      await expect(page.locator('text=Alasan Penolakan')).toBeVisible();
      await page.fill('textarea[name="rejection_reason"]', 'Harga terlalu tinggi, perlu negosiasi ulang');
      await page.click('button:has-text("Konfirmasi Tolak")');

      await expect(page.locator('text=PO berhasil ditolak')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });

    test('prevents approval by same user who created PO (SoD violation)', async ({ page }) => {
      await page.route('**/rest/v1/purchase_orders*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'po-003',
            po_number: 'PO-2026-003',
            project_id: 'proj-001',
            vendor_name: 'PT Material Utama',
            total_amount: 180000000n,
            status: 'Menunggu Persetujuan',
            created_at: '2026-10-10T00:00:00Z',
            created_by: '00000000-0000-0000-0000-000000000001',
            workspace_id: 'ws-test',
          }]),
        });
      });

      await page.route('**/rest/v1/rpc/approve_purchase_order', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Separation of Duties violation: cannot approve own PO',
          }),
        });
      });

      await page.goto('/procurement');
      await page.click('text=PO-2026-003');

      const approveButton = page.locator('button:has-text("Setujui")');
      if (await approveButton.isVisible()) {
        await approveButton.click();
        await expect(page.locator('text=Separation of Duties')).toBeVisible();
      } else {
        await expect(page.locator('text=Anda tidak dapat menyetujui PO yang Anda buat')).toBeVisible();
      }

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });

    test('displays approval history and SoD audit trail', async ({ page }) => {
      await page.route('**/rest/v1/purchase_orders*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'po-004',
            po_number: 'PO-2026-004',
            project_id: 'proj-001',
            vendor_name: 'PT Supplier Terpercaya',
            total_amount: 300000000n,
            status: 'Disetujui',
            created_at: '2026-10-01T00:00:00Z',
            created_by: 'user-creator',
            approved_at: '2026-10-03T08:30:00Z',
            approved_by: '00000000-0000-0000-0000-000000000001',
            workspace_id: 'ws-test',
          }]),
        });
      });

      await page.route('**/rest/v1/audit_logs*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'audit-1',
              action: 'purchase_order_created',
              actor_id: 'user-creator',
              actor_name: 'Project Manager',
              timestamp: '2026-10-01T00:00:00Z',
              details: { po_number: 'PO-2026-004', vendor: 'PT Supplier Terpercaya' },
            },
            {
              id: 'audit-2',
              action: 'purchase_order_approved',
              actor_id: '00000000-0000-0000-0000-000000000001',
              actor_name: 'Budget Approver',
              timestamp: '2026-10-03T08:30:00Z',
              details: { po_number: 'PO-2026-004', sod_check_passed: true },
            },
          ]),
        });
      });

      await page.goto('/procurement');
      await page.click('text=PO-2026-004');

      await expect(page.locator('text=Disetujui')).toBeVisible();
      await page.click('text=Riwayat Persetujuan');

      await expect(page.locator('text=Project Manager')).toBeVisible();
      await expect(page.locator('text=Budget Approver')).toBeVisible();
      await expect(page.locator('text=purchase_order_approved')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });
  });

  test.describe('Vendor Management', () => {
    test('displays vendor list with contact info', async ({ page }) => {
      await page.route('**/rest/v1/vendors*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'vendor-1',
              name: 'PT Semen Indonesia',
              contact_name: 'Budi Santoso',
              phone: '021-1234567',
              email: 'budi@semenindonesia.com',
              address: 'Jakarta',
              workspace_id: 'ws-test',
            },
            {
              id: 'vendor-2',
              name: 'PT Baja Konstruksi',
              contact_name: 'Siti Nurhaliza',
              phone: '021-7654321',
              email: 'siti@bajakonstruksi.com',
              address: 'Bekasi',
              workspace_id: 'ws-test',
            },
          ]),
        });
      });

      await page.goto('/procurement/vendors');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=PT Semen Indonesia')).toBeVisible();
      await expect(page.locator('text=Budi Santoso')).toBeVisible();
      await expect(page.locator('text=021-1234567')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });
  });

  test.describe('PO Status Tracking', () => {
    test('tracks PO status transitions', async ({ page }) => {
      await page.route('**/rest/v1/purchase_orders*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'po-005',
              po_number: 'PO-2026-005',
              project_id: 'proj-001',
              vendor_name: 'PT Logistik Cepat',
              total_amount: 120000000n,
              status: 'Dalam Pengiriman',
              created_at: '2026-09-20T00:00:00Z',
              approved_at: '2026-09-22T00:00:00Z',
              shipped_at: '2026-09-25T00:00:00Z',
              workspace_id: 'ws-test',
            },
          ]),
        });
      });

      await page.goto('/procurement');
      await page.click('text=PO-2026-005');

      await expect(page.locator('text=Dalam Pengiriman')).toBeVisible();
      await expect(page.locator('text=PT Logistik Cepat')).toBeVisible();

      await page.click('button:has-text("Konfirmasi Terima")');
      await page.waitForLoadState('networkidle');

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });
  });
});
