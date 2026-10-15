import { test, expect } from '@playwright/test';

test.describe('Budget Workflows (RAB)', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    (page as any).consoleErrors = consoleErrors;

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
          email: 'estimator@indotek.com',
          name: 'Budget Estimator',
          role: 'Estimator',
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
          email: 'estimator@indotek.com',
          name: 'Budget Estimator',
          role: 'Estimator',
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
          ppn_percent: 11,
          workspace_id: 'ws-test',
        }]),
      });
    });
  });

  test.describe('RAB Line Items', () => {
    test('displays budget lines with codes and calculations', async ({ page }) => {
      await page.route('**/rest/v1/budget_lines*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'bl-001',
              project_id: 'proj-001',
              code: '1.1.1',
              description: 'Pekerjaan Tanah',
              unit: 'm³',
              quantity: 1200,
              unit_price: 45000n,
              total: 54000000n,
              workspace_id: 'ws-test',
            },
            {
              id: 'bl-002',
              project_id: 'proj-001',
              code: '1.1.2',
              description: 'Pondasi Batu Kali',
              unit: 'm³',
              quantity: 350,
              unit_price: 850000n,
              total: 297500000n,
              workspace_id: 'ws-test',
            },
          ]),
        });
      });

      await page.goto('/projects/proj-001?tab=anggaran');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=1.1.1')).toBeVisible();
      await expect(page.locator('text=Pekerjaan Tanah')).toBeVisible();
      await expect(page.locator('text=Rp 54.000.000')).toBeVisible();
      await expect(page.locator('text=Pondasi Batu Kali')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });

    test('adds new budget line item', async ({ page }) => {
      await page.route('**/rest/v1/budget_lines*', async (route) => {
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
              id: 'bl-new',
              ...postData,
              total: postData.quantity * postData.unit_price,
            }),
          });
        }
      });

      await page.goto('/projects/proj-001?tab=anggaran');
      await page.click('button:has-text("Tambah Item")');

      await page.fill('input[name="code"]', '2.1.1');
      await page.fill('input[name="description"]', 'Beton K-300');
      await page.fill('input[name="quantity"]', '85');
      await page.selectOption('select[name="unit"]', 'm³');
      await page.fill('input[name="unit_price"]', '1250000');

      await page.click('button:has-text("Simpan")');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=2.1.1')).toBeVisible();
      await expect(page.locator('text=Beton K-300')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });

    test('validates budget line required fields', async ({ page }) => {
      await page.route('**/rest/v1/budget_lines*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/projects/proj-001?tab=anggaran');
      await page.click('button:has-text("Tambah Item")');

      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=Kode wajib diisi')).toBeVisible();
      await expect(page.locator('text=Deskripsi wajib diisi')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });
  });

  test.describe('Budget Revisions', () => {
    test('submits budget revision request', async ({ page }) => {
      await page.route('**/rest/v1/budget_revisions*', async (route) => {
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
              id: 'rev-001',
              ...postData,
              status: 'Menunggu Persetujuan',
              created_at: new Date().toISOString(),
            }),
          });
        }
      });

      await page.goto('/projects/proj-001?tab=revisi');
      await page.click('button:has-text("Ajukan Revisi")');

      await page.fill('textarea[name="reason"]', 'Perubahan desain struktur atap');
      await page.fill('input[name="amount_change"]', '25000000');
      await page.selectOption('select[name="revision_type"]', 'Penambahan');

      await page.click('button:has-text("Kirim Pengajuan")');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=Menunggu Persetujuan')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });

    test('approves budget revision', async ({ page }) => {
      await page.route('**/rest/v1/budget_revisions*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'rev-001',
            project_id: 'proj-001',
            reason: 'Perubahan desain struktur atap',
            amount_change: 25000000n,
            revision_type: 'Penambahan',
            status: 'Menunggu Persetujuan',
            created_at: '2026-10-10T00:00:00Z',
            workspace_id: 'ws-test',
          }]),
        });
      });

      await page.route('**/rest/v1/rpc/approve_budget_revision', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/projects/proj-001?tab=revisi');
      await page.click('text=Perubahan desain struktur atap');

      await page.click('button:has-text("Setujui Revisi")');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=Revisi berhasil disetujui')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });
  });

  test.describe('BOQ Items', () => {
    test('displays BOQ items with progress tracking', async ({ page }) => {
      await page.route('**/rest/v1/boq_items*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'boq-001',
              project_id: 'proj-001',
              code: 'BOQ-001',
              description: 'Pekerjaan Struktur Beton',
              unit: 'm³',
              quantity: 250,
              unit_price: 1500000n,
              total: 375000000n,
              progress_percent: 45,
              workspace_id: 'ws-test',
            },
          ]),
        });
      });

      await page.goto('/projects/proj-001?tab=boq');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=BOQ-001')).toBeVisible();
      await expect(page.locator('text=Pekerjaan Struktur Beton')).toBeVisible();
      await expect(page.locator('text=45%')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });

    test('updates BOQ item progress', async ({ page }) => {
      await page.route('**/rest/v1/boq_items*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'boq-001',
            project_id: 'proj-001',
            code: 'BOQ-001',
            description: 'Pekerjaan Struktur Beton',
            unit: 'm³',
            quantity: 250,
            unit_price: 1500000n,
            total: 375000000n,
            progress_percent: 45,
            workspace_id: 'ws-test',
          }]),
        });
      });

      await page.route('**/rest/v1/rpc/update_boq_progress', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/projects/proj-001?tab=boq');
      await page.click('text=BOQ-001');

      await page.fill('input[name="progress_percent"]', '60');
      await page.click('button:has-text("Update Progress")');

      await expect(page.locator('text=Progress berhasil diupdate')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });
  });

  test.describe('Payment Terms', () => {
    test('displays payment schedule with termin', async ({ page }) => {
      await page.route('**/rest/v1/rpc/get_payment_schedule*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            terms: [
              {
                id: 'term-1',
                termin_number: 1,
                description: 'DP 20%',
                percentage: 20,
                amount: 100000000n,
                due_date: '2026-11-01',
                status: 'Lunas',
                paid_at: '2026-10-28T00:00:00Z',
              },
              {
                id: 'term-2',
                termin_number: 2,
                description: 'Progress 40%',
                percentage: 40,
                amount: 200000000n,
                due_date: '2026-12-01',
                status: 'Belum Bayar',
              },
            ],
          }),
        });
      });

      await page.goto('/projects/proj-001?tab=pembayaran');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=Termin 1')).toBeVisible();
      await expect(page.locator('text=DP 20%')).toBeVisible();
      await expect(page.locator('text=Lunas')).toBeVisible();
      await expect(page.locator('text=Termin 2')).toBeVisible();
      await expect(page.locator('text=Belum Bayar')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });

    test('marks payment term as paid', async ({ page }) => {
      await page.route('**/rest/v1/rpc/get_payment_schedule*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            terms: [{
              id: 'term-2',
              termin_number: 2,
              description: 'Progress 40%',
              percentage: 40,
              amount: 200000000n,
              due_date: '2026-12-01',
              status: 'Belum Bayar',
            }],
          }),
        });
      });

      await page.route('**/rest/v1/rpc/update_payment_status', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/projects/proj-001?tab=pembayaran');
      await page.click('text=Termin 2');

      await page.click('button:has-text("Tandai Lunas")');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=Pembayaran berhasil dicatat')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });
  });

  test.describe('PPN Calculation', () => {
    test('displays budget with PPN calculation', async ({ page }) => {
      await page.route('**/rest/v1/budget_lines*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'bl-001',
            project_id: 'proj-001',
            code: '1.1.1',
            description: 'Pekerjaan Tanah',
            unit: 'm³',
            quantity: 1200,
            unit_price: 45000n,
            total: 54000000n,
            workspace_id: 'ws-test',
          }]),
        });
      });

      await page.goto('/projects/proj-001?tab=anggaran');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=Subtotal')).toBeVisible();
      await expect(page.locator('text=PPN 11%')).toBeVisible();
      await expect(page.locator('text=Total Termasuk PPN')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });

    test('updates project PPN percentage', async ({ page }) => {
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
            ppn_percent: 11,
            workspace_id: 'ws-test',
          }]),
        });
      });

      await page.route('**/rest/v1/rpc/update_project_ppn', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/projects/proj-001?tab=anggaran');
      await page.click('button:has-text("Pengaturan PPN")');

      await page.fill('input[name="ppn_percent"]', '12');
      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=PPN berhasil diupdate')).toBeVisible();

      const errors = (page as any).consoleErrors.filter(
        (msg: string) => !msg.includes('ResizeObserver')
      );
      expect(errors.length).toBe(0);
    });
  });
});
