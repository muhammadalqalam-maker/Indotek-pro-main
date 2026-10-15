import { test, expect } from '@playwright/test';

test.describe('Materials Stock Workflows', () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('ResizeObserver')) {
          errors.push(text);
        }
      }
    });
    (page as any)._consoleErrors = errors;

    await page.addInitScript((session) => {
      localStorage.setItem('sb-access-token', session.access_token);
      localStorage.setItem('sb-refresh-token', 'mock-refresh-token');
    }, { access_token: 'mock-token' });

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

  test.describe('Stock Mutation (Mutasi Stok)', () => {
    test('displays stock mutations list without console errors', async ({ page }) => {
      await page.route('**/rest/v1/stock_mutations*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'sm-001',
              material_id: 'mat-001',
              material_name: 'Semen Portland',
              quantity: 100,
              unit: 'zak',
              mutation_type: 'Keluar',
              reason: 'Pemakaian proyek',
              location_from: 'Gudang Utama',
              location_to: 'Proyek A',
              created_at: '2026-10-15T10:00:00Z',
              status: 'Selesai',
            },
          ]),
        });
      });

      await page.goto('/material');
      await page.click('text=Mutasi Stok');

      await expect(page.locator('text=Semen Portland')).toBeVisible();
      await expect(page.locator('text=100 zak')).toBeVisible();
      await expect(page.locator('text=Keluar')).toBeVisible();
      await expect(page.locator('text=Selesai')).toBeVisible();

      const errors = (page as any)._consoleErrors;
      expect(errors.length).toBe(0);
    });

    test('creates outgoing stock mutation (Keluar)', async ({ page }) => {
      await page.route('**/rest/v1/stock_mutations*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'sm-002',
              material_id: 'mat-002',
              material_name: 'Pasir',
              quantity: 50,
              unit: 'm3',
              mutation_type: 'Keluar',
              reason: 'Pemakaian konstruksi',
              location_to: 'Lokasi Proyek',
              status: 'Selesai',
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

      await page.route('**/rest/v1/materials*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'mat-002',
              material_name: 'Pasir',
              unit: 'm3',
              current_stock: 100,
            },
          ]),
        });
      });

      await page.goto('/material');
      await page.click('text=Mutasi Stok');
      await page.click('text=Mutasi Baru');

      await page.selectOption('select[name="material_id"]', 'mat-002');
      await page.selectOption('select[name="mutation_type"]', 'Keluar');
      await page.fill('input[name="quantity"]', '50');
      await page.fill('input[name="location_to"]', 'Lokasi Proyek');
      await page.fill('textarea[name="reason"]', 'Pemakaian konstruksi');
      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=berhasil')).toBeVisible();
    });

    test('creates incoming stock mutation (Masuk)', async ({ page }) => {
      await page.route('**/rest/v1/stock_mutations*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'sm-003',
              material_id: 'mat-003',
              material_name: 'Batu Bata',
              quantity: 1000,
              unit: 'biji',
              mutation_type: 'Masuk',
              reason: 'Pembelian dari supplier',
              location_from: 'Supplier ABC',
              status: 'Selesai',
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

      await page.route('**/rest/v1/materials*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'mat-003',
              material_name: 'Batu Bata',
              unit: 'biji',
              current_stock: 500,
            },
          ]),
        });
      });

      await page.goto('/material');
      await page.click('text=Mutasi Stok');
      await page.click('text=Mutasi Baru');

      await page.selectOption('select[name="material_id"]', 'mat-003');
      await page.selectOption('select[name="mutation_type"]', 'Masuk');
      await page.fill('input[name="quantity"]', '1000');
      await page.fill('input[name="location_from"]', 'Supplier ABC');
      await page.fill('textarea[name="reason"]', 'Pembelian dari supplier');
      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=berhasil')).toBeVisible();
    });

    test('validates stock availability before outgoing mutation', async ({ page }) => {
      await page.route('**/rest/v1/stock_mutations*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Stok tidak cukup. Tersedia: 30 zak, diminta: 50 zak',
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

      await page.route('**/rest/v1/materials*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'mat-004',
              material_name: 'Semen',
              unit: 'zak',
              current_stock: 30,
            },
          ]),
        });
      });

      await page.goto('/material');
      await page.click('text=Mutasi Stok');
      await page.click('text=Mutasi Baru');

      await page.selectOption('select[name="material_id"]', 'mat-004');
      await page.selectOption('select[name="mutation_type"]', 'Keluar');
      await page.fill('input[name="quantity"]', '50');
      await page.fill('input[name="location_to"]', 'Proyek');
      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=Stok tidak cukup')).toBeVisible();
    });
  });

  test.describe('Stock Adjustment (Opname)', () => {
    test('displays stock adjustments list', async ({ page }) => {
      await page.route('**/rest/v1/stock_adjustments*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'sa-001',
              adjustment_date: '2026-10-15',
              status: 'Menunggu Persetujuan',
              total_adjustments: 5,
              notes: 'Opname rutin bulanan',
            },
          ]),
        });
      });

      await page.goto('/material');
      await page.click('text=Opname Stok');

      await expect(page.locator('text=Opname rutin bulanan')).toBeVisible();
      await expect(page.locator('text=Menunggu Persetujuan')).toBeVisible();

      const errors = (page as any)._consoleErrors;
      expect(errors.length).toBe(0);
    });

    test('creates new opname adjustment batch', async ({ page }) => {
      await page.route('**/rest/v1/stock_adjustments*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'sa-002',
              adjustment_date: '2026-10-15',
              status: 'Draft',
              notes: 'Opname fisik harian',
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

      await page.goto('/material');
      await page.click('text=Opname Stok');
      await page.click('text=Opname Baru');

      await page.fill('textarea[name="notes"]', 'Opname fisik harian');
      await page.click('button:has-text("Buat")');

      await expect(page.locator('text=berhasil')).toBeVisible();
    });

    test('adds material variance to opname', async ({ page }) => {
      await page.route('**/rest/v1/stock_adjustments*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'sa-003',
              adjustment_date: '2026-10-15',
              status: 'Draft',
            },
          ]),
        });
      });

      await page.route('**/rest/v1/stock_adjustment_items*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'sai-001',
              stock_adjustment_id: 'sa-003',
              material_id: 'mat-005',
              material_name: 'Semen',
              system_quantity: 100,
              physical_quantity: 95,
              variance: -5,
              unit: 'zak',
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

      await page.route('**/rest/v1/materials*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'mat-005',
              material_name: 'Semen',
              unit: 'zak',
              current_stock: 100,
            },
          ]),
        });
      });

      await page.goto('/material');
      await page.click('text=Opname Stok');
      await page.click('text=Opname Baru');
      await page.click('text=Tambah Item');

      await page.selectOption('select[name="material_id"]', 'mat-005');
      await page.fill('input[name="physical_quantity"]', '95');
      await page.click('button:has-text("Tambah")');

      await expect(page.locator('text=-5 zak')).toBeVisible();
    });

    test('submits opname adjustment for approval', async ({ page }) => {
      await page.route('**/rest/v1/stock_adjustments*', async (route) => {
        if (route.request().method() === 'PATCH') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'sa-004',
              status: 'Menunggu Persetujuan',
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'sa-004',
                adjustment_date: '2026-10-15',
                status: 'Draft',
              },
            ]),
          });
        }
      });

      await page.route('**/rest/v1/stock_adjustment_items*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/material');
      await page.click('text=Opname Stok');
      await page.click('text=Opname Baru');
      await page.click('button:has-text("Ajukan")');

      await expect(page.locator('text=berhasil')).toBeVisible();
    });

    test('approves opname adjustment', async ({ page }) => {
      await page.route('**/rest/v1/stock_adjustments*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'sa-005',
              adjustment_date: '2026-10-15',
              status: 'Menunggu Persetujuan',
              submitted_by: '00000000-0000-0000-0000-000000000002',
            },
          ]),
        });
      });

      await page.route('**/rest/v1/rpc/approve_stock_adjustment', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/material');
      await page.click('text=Opname Stok');
      await page.click('[data-id="sa-005"]');
      await page.click('button:has-text("Setujui")');

      await expect(page.locator('text=berhasil disetujui')).toBeVisible();
    });

    test('rejects opname adjustment with reason', async ({ page }) => {
      await page.route('**/rest/v1/stock_adjustments*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'sa-006',
              adjustment_date: '2026-10-15',
              status: 'Menunggu Persetujuan',
              submitted_by: '00000000-0000-0000-0000-000000000002',
            },
          ]),
        });
      });

      await page.route('**/rest/v1/rpc/reject_stock_adjustment', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/material');
      await page.click('text=Opname Stok');
      await page.click('[data-id="sa-006"]');
      await page.click('button:has-text("Tolak")');

      await page.fill('textarea[name="rejection_reason"]', 'Data kurang akurat');
      await page.click('button:has-text("Konfirmasi")');

      await expect(page.locator('text=berhasil ditolak')).toBeVisible();
    });

    test('prevents approval by submitter (SoD violation)', async ({ page }) => {
      await page.route('**/rest/v1/stock_adjustments*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'sa-007',
              adjustment_date: '2026-10-15',
              status: 'Menunggu Persetujuan',
              submitted_by: '00000000-0000-0000-0000-000000000001', // Same as current user
            },
          ]),
        });
      });

      await page.route('**/rest/v1/rpc/approve_stock_adjustment', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Separation of Duties violation: cannot approve own submission',
          }),
        });
      });

      await page.goto('/material');
      await page.click('text=Opname Stok');
      await page.click('[data-id="sa-007"]');
      await page.click('button:has-text("Setujui")');

      await expect(page.locator('text=Separation of Duties violation')).toBeVisible();
    });
  });

  test.describe('Stock Balance Tracking', () => {
    test('displays current stock balance', async ({ page }) => {
      await page.route('**/rest/v1/materials*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'mat-006',
              material_name: 'Semen Portland',
              unit: 'zak',
              current_stock: 250,
              reorder_point: 100,
            },
          ]),
        });
      });

      await page.goto('/material');

      await expect(page.locator('text=250 zak')).toBeVisible();
    });

    test('highlights low stock items', async ({ page }) => {
      await page.route('**/rest/v1/materials*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'mat-007',
              material_name: 'Paku',
              unit: 'kg',
              current_stock: 50,
              reorder_point: 100,
            },
          ]),
        });
      });

      await page.goto('/material');

      const lowStockItem = page.locator('[data-low-stock="true"]');
      await expect(lowStockItem).toBeVisible();
    });

    test('updates stock balance after successful mutation', async ({ page }) => {
      await page.route('**/rest/v1/materials*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'mat-008',
              material_name: 'Pasir',
              unit: 'm3',
              current_stock: 145, // 150 - 5 after mutation
            },
          ]),
        });
      });

      await page.route('**/rest/v1/stock_mutations*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'sm-010',
              material_id: 'mat-008',
              quantity: 5,
              unit: 'm3',
              mutation_type: 'Keluar',
              status: 'Selesai',
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

      await page.goto('/material');
      await page.click('text=Mutasi Stok');
      await page.click('text=Mutasi Baru');

      await page.selectOption('select[name="material_id"]', 'mat-008');
      await page.selectOption('select[name="mutation_type"]', 'Keluar');
      await page.fill('input[name="quantity"]', '5');
      await page.fill('input[name="location_to"]', 'Proyek');
      await page.click('button:has-text("Simpan")');

      // Navigate back to materials list
      await page.goto('/material');
      await expect(page.locator('text=145 m3')).toBeVisible();
    });
  });
});
