import { test, expect } from '@playwright/test';

test.describe('Field Reports Workflows', () => {
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

  test.describe('Field Report Submission', () => {
    test('displays field reports list without console errors', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'fr-001',
              project_id: 'proj-001',
              report_date: '2026-10-15',
              author: 'Test User',
              weather: 'Cerah',
              workers_count: 25,
              equipment_status: 'Siap',
              activities: 'Pekerjaan pondasi dimulai',
              status: 'Selesai',
              created_at: '2026-10-15T10:00:00Z',
            },
          ]),
        });
      });

      await page.goto('/field-report');

      await expect(page.locator('text=Laporan Harian')).toBeVisible();
      await expect(page.locator('text=Test Project')).toBeVisible();
      await expect(page.locator('text=Pekerjaan pondasi dimulai')).toBeVisible();

      const errors = (page as any)._consoleErrors;
      expect(errors.length).toBe(0);
    });

    test('opens new field report modal', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/field-report');
      await page.click('text=Laporan Baru');

      await expect(page.locator('text=Buat Laporan Harian')).toBeVisible();
      await expect(page.locator('input[name="weather"]')).toBeVisible();
      await expect(page.locator('textarea[name="activities"]')).toBeVisible();
    });

    test('submits new field report with valid data', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'fr-002',
              project_id: 'proj-001',
              report_date: '2026-10-15',
              author: 'Test User',
              weather: 'Berawan',
              workers_count: 30,
              equipment_status: 'Siap',
              activities: 'Penggalian dan pemadatan tanah',
              status: 'Draft',
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

      await page.goto('/field-report');
      await page.click('text=Laporan Baru');

      await page.selectOption('select[name="project_id"]', 'proj-001');
      await page.fill('input[name="weather"]', 'Berawan');
      await page.fill('input[name="workers_count"]', '30');
      await page.selectOption('select[name="equipment_status"]', 'Siap');
      await page.fill('textarea[name="activities"]', 'Penggalian dan pemadatan tanah');
      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=berhasil')).toBeVisible();
    });

    test('validates required fields in field report form', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/field-report');
      await page.click('text=Laporan Baru');
      await page.click('button:has-text("Simpan")');

      await expect(page.locator('text=diperlukan')).toBeVisible();
    });
  });

  test.describe('Photo Attachments', () => {
    test('uploads photo attachment to field report', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'fr-003',
              project_id: 'proj-001',
              report_date: '2026-10-15',
              status: 'Draft',
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

      await page.route('**/storage/v1/object/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key: 'photo-001' }),
        });
      });

      await page.goto('/field-report');
      await page.click('text=Laporan Baru');

      // Create and upload a mock file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test-photo.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake image data'),
      });

      await expect(page.locator('text=test-photo.jpg')).toBeVisible();
    });

    test('displays uploaded photo in report detail', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'fr-004',
              project_id: 'proj-001',
              report_date: '2026-10-15',
              activities: 'Laporan dengan foto',
              status: 'Selesai',
              attachments: [
                {
                  id: 'att-001',
                  file_name: 'foundation-photo.jpg',
                  file_url: 'https://mock-storage.com/photos/foundation.jpg',
                  file_type: 'image/jpeg',
                },
              ],
            },
          ]),
        });
      });

      await page.goto('/field-report');
      await page.click('text=foundation-photo.jpg');

      await expect(page.locator('img[src*="foundation.jpg"]')).toBeVisible();
    });
  });

  test.describe('Approval Workflow', () => {
    test('submits field report for approval', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        if (route.request().method() === 'PATCH') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'fr-005',
              status: 'Menunggu Persetujuan',
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'fr-005',
                project_id: 'proj-001',
                report_date: '2026-10-15',
                status: 'Draft',
                author_id: '00000000-0000-0000-0000-000000000002',
              },
            ]),
          });
        }
      });

      await page.goto('/field-report');
      await page.click('[data-id="fr-005"]');
      await page.click('button:has-text("Ajukan")');

      await expect(page.locator('text=berhasil')).toBeVisible();
    });

    test('approves field report', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'fr-006',
              project_id: 'proj-001',
              report_date: '2026-10-15',
              status: 'Menunggu Persetujuan',
              author_id: '00000000-0000-0000-0000-000000000002',
            },
          ]),
        });
      });

      await page.route('**/rest/v1/rpc/approve_field_report', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/field-report');
      await page.click('[data-id="fr-006"]');
      await page.click('button:has-text("Setujui")');

      await expect(page.locator('text=disetujui')).toBeVisible();
    });

    test('rejects field report with comment', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'fr-007',
              project_id: 'proj-001',
              report_date: '2026-10-15',
              status: 'Menunggu Persetujuan',
              author_id: '00000000-0000-0000-0000-000000000002',
            },
          ]),
        });
      });

      await page.route('**/rest/v1/rpc/reject_field_report', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/field-report');
      await page.click('[data-id="fr-007"]');
      await page.click('button:has-text("Tolak")');

      await page.fill('textarea[name="rejection_reason"]', 'Data aktivitas kurang detail');
      await page.click('button:has-text("Konfirmasi")');

      await expect(page.locator('text=ditolak')).toBeVisible();
    });

    test('prevents self-approval (SoD violation)', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'fr-008',
              project_id: 'proj-001',
              report_date: '2026-10-15',
              status: 'Menunggu Persetujuan',
              author_id: '00000000-0000-0000-0000-000000000001', // Same as current user
            },
          ]),
        });
      });

      await page.route('**/rest/v1/rpc/approve_field_report', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Separation of Duties violation: cannot approve own report',
          }),
        });
      });

      await page.goto('/field-report');
      await page.click('[data-id="fr-008"]');
      await page.click('button:has-text("Setujui")');

      await expect(page.locator('text=Separation of Duties violation')).toBeVisible();
    });
  });

  test.describe('Filtering and Search', () => {
    test('filters field reports by date range', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        const url = new URL(route.request().url());
        const hasDateFilter = url.searchParams.has('report_date');
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            hasDateFilter
              ? [
                  {
                    id: 'fr-009',
                    project_id: 'proj-001',
                    report_date: '2026-10-15',
                    status: 'Selesai',
                  },
                ]
              : []
          ),
        });
      });

      await page.goto('/field-report');
      await page.fill('input[name="date_from"]', '2026-10-15');
      await page.fill('input[name="date_to"]', '2026-10-15');
      await page.click('button:has-text("Terapkan")');

      await expect(page.locator('text=2026-10-15')).toBeVisible();
    });

    test('filters field reports by status', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        const url = new URL(route.request().url());
        const status = url.searchParams.get('status');
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            status === 'Menunggu Persetujuan'
              ? [
                  {
                    id: 'fr-010',
                    project_id: 'proj-001',
                    report_date: '2026-10-15',
                    status: 'Menunggu Persetujuan',
                  },
                ]
              : []
          ),
        });
      });

      await page.goto('/field-report');
      await page.selectOption('select[name="status"]', 'Menunggu Persetujuan');
      await page.click('button:has-text("Terapkan")');

      await expect(page.locator('text=Menunggu Persetujuan')).toBeVisible();
    });

    test('searches field reports by project name', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        const url = new URL(route.request().url());
        const search = url.searchParams.get('project_name');
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            search
              ? [
                  {
                    id: 'fr-011',
                    project_id: 'proj-001',
                    project_name: 'Test Project',
                    report_date: '2026-10-15',
                    status: 'Selesai',
                  },
                ]
              : []
          ),
        });
      });

      await page.goto('/field-report');
      await page.fill('input[name="search"]', 'Test Project');
      await page.click('button:has-text("Cari")');

      await expect(page.locator('text=Test Project')).toBeVisible();
    });
  });
});
