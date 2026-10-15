import { test, expect } from '@playwright/test';

test.describe('Offline Queue Functionality', () => {
  test.beforeEach(async ({ page, context }) => {
    // Filter console errors (allow ResizeObserver)
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('ResizeObserver')) {
        throw new Error(`Console error: ${msg.text()}`);
      }
    });

    // Inject auth token
    await page.addInitScript((session) => {
      localStorage.setItem('sb-auth-token', JSON.stringify(session));
    }, {
      access_token: 'mock-token-abc123',
      user: { id: 'user-123', email: 'test@example.com' }
    });

    // Mock auth endpoints
    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ user: { id: 'user-123' } }) });
    });

    // Mock users endpoint
    await page.route('**/rest/v1/users*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([{
          id: 'user-123',
          email: 'test@example.com',
          display_name: 'Test User',
          active_role: 'Site Manager',
          photo_url: null,
          is_verified: true
        }])
      });
    });

    // Mock workspace_members
    await page.route('**/rest/v1/workspace_members*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([{
          id: 'wm-123',
          user_id: 'user-123',
          workspace_id: 'ws-123',
          role: 'Site Manager',
          status: 'Aktif'
        }])
      });
    });

    // Mock projects
    await page.route('**/rest/v1/projects*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([{
          id: 'proj-001',
          name: 'Tower Konstruksi A',
          budget: 5000000000,
          status: 'Aktif',
          start_date: '2024-01-01',
          target_end_date: '2024-12-31'
        }])
      });
    });
  });

  test.describe('Offline Queue Creation', () => {
    test('queues field report submission when offline', async ({ page, context }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        await route.fulfill({ status: 200, body: JSON.stringify([]) });
      });

      await page.goto('/projects/proj-001/field-reports');
      await page.waitForLoadState('networkidle');

      // Simulate offline mode
      await context.setOffline(true);

      // Try to submit field report
      const newButton = page.getByRole('button', { name: /Laporan Baru/i });
      await newButton.click();

      await page.fill('input[name="title"]', 'Laporan Offline Test');
      await page.fill('textarea[name="content"]', 'Konten laporan yang dibuat saat offline');

      const submitButton = page.getByRole('button', { name: /Kirim/i });
      await submitButton.click();

      // Should show queued message
      const queuedToast = page.locator('[role="alert"]').filter({ hasText: /disimpan di antrian/i });
      await expect(queuedToast).toBeVisible();

      // Check localStorage for queued item
      const queueData = await page.evaluate(() => {
        return localStorage.getItem('offline-queue');
      });

      expect(queueData).toBeTruthy();
      const queue = JSON.parse(queueData!);
      expect(queue).toHaveLength(1);
      expect(queue[0].type).toBe('field_report');
    });

    test('queues stock mutation when offline', async ({ page, context }) => {
      await page.route('**/rest/v1/stock_mutations*', async (route) => {
        await route.fulfill({ status: 200, body: JSON.stringify([]) });
      });

      await page.route('**/rest/v1/materials*', async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify([{
            id: 'mat-001',
            name: 'Semen Portland',
            unit: 'sak',
            current_stock: 100
          }])
        });
      });

      await page.goto('/materials');
      await page.waitForLoadState('networkidle');

      // Go offline
      await context.setOffline(true);

      // Try to create mutation
      const mutationButton = page.getByRole('button', { name: /Mutasi Stok/i });
      await mutationButton.click();

      await page.selectOption('select[name="material_id"]', 'mat-001');
      await page.selectOption('select[name="type"]', 'Keluar');
      await page.fill('input[name="quantity"]', '10');
      await page.fill('textarea[name="notes"]', 'Mutasi offline');

      const submitButton = page.getByRole('button', { name: /Simpan/i });
      await submitButton.click();

      const queuedToast = page.locator('[role="alert"]').filter({ hasText: /disimpan di antrian/i });
      await expect(queuedToast).toBeVisible();
    });

    test('displays offline indicator when disconnected', async ({ page, context }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Go offline
      await context.setOffline(true);

      // Wait for offline indicator
      await page.waitForTimeout(1000);

      const offlineIndicator = page.locator('[data-offline-indicator]');
      await expect(offlineIndicator).toBeVisible();
      await expect(offlineIndicator).toContainText(/offline/i);
    });
  });

  test.describe('Queue Synchronization', () => {
    test('syncs queued items when back online', async ({ page, context }) => {
      let syncCallCount = 0;

      await page.route('**/rest/v1/field_reports*', async (route) => {
        if (route.request().method() === 'POST') {
          syncCallCount++;
          await route.fulfill({
            status: 201,
            body: JSON.stringify({
              id: 'fr-sync-001',
              project_id: 'proj-001',
              title: 'Laporan Offline Test',
              content: 'Konten laporan',
              status: 'Draft'
            })
          });
        } else {
          await route.fulfill({ status: 200, body: JSON.stringify([]) });
        }
      });

      await page.goto('/projects/proj-001/field-reports');
      await page.waitForLoadState('networkidle');

      // Go offline and queue item
      await context.setOffline(true);

      const newButton = page.getByRole('button', { name: /Laporan Baru/i });
      await newButton.click();

      await page.fill('input[name="title"]', 'Laporan Offline Test');
      await page.fill('textarea[name="content"]', 'Konten laporan');

      const submitButton = page.getByRole('button', { name: /Kirim/i });
      await submitButton.click();

      await page.waitForTimeout(500);

      // Go back online
      await context.setOffline(false);

      // Trigger sync
      await page.reload();
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(2000);

      // Verify sync happened
      expect(syncCallCount).toBeGreaterThan(0);

      // Queue should be empty
      const queueData = await page.evaluate(() => {
        return localStorage.getItem('offline-queue');
      });

      const queue = queueData ? JSON.parse(queueData) : [];
      expect(queue).toHaveLength(0);
    });

    test('displays sync status during synchronization', async ({ page, context }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        if (route.request().method() === 'POST') {
          // Simulate slow network
          await new Promise(resolve => setTimeout(resolve, 1000));
          await route.fulfill({
            status: 201,
            body: JSON.stringify({ id: 'fr-001', status: 'Draft' })
          });
        } else {
          await route.fulfill({ status: 200, body: JSON.stringify([]) });
        }
      });

      // Pre-populate queue
      await page.goto('/projects/proj-001/field-reports');
      await page.evaluate(() => {
        localStorage.setItem('offline-queue', JSON.stringify([{
          id: 'queue-001',
          type: 'field_report',
          data: { title: 'Test', content: 'Test' },
          timestamp: Date.now()
        }]));
      });

      await context.setOffline(false);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should show syncing indicator
      const syncIndicator = page.locator('[data-sync-indicator]');
      await expect(syncIndicator).toBeVisible();
    });

    test('handles sync failures gracefully', async ({ page, context }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 500,
            body: JSON.stringify({ error: 'Server error' })
          });
        } else {
          await route.fulfill({ status: 200, body: JSON.stringify([]) });
        }
      });

      // Pre-populate queue
      await page.goto('/projects/proj-001/field-reports');
      await page.evaluate(() => {
        localStorage.setItem('offline-queue', JSON.stringify([{
          id: 'queue-001',
          type: 'field_report',
          data: { title: 'Test', content: 'Test' },
          timestamp: Date.now(),
          retries: 0
        }]));
      });

      await context.setOffline(false);
      await page.reload();
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(2000);

      // Queue should still have item (retry logic)
      const queueData = await page.evaluate(() => {
        return localStorage.getItem('offline-queue');
      });

      const queue = JSON.parse(queueData!);
      expect(queue).toHaveLength(1);
      expect(queue[0].retries).toBeGreaterThan(0);
    });
  });

  test.describe('Queue Management UI', () => {
    test('displays queued items count in UI', async ({ page, context }) => {
      await page.goto('/dashboard');

      // Add items to queue
      await page.evaluate(() => {
        localStorage.setItem('offline-queue', JSON.stringify([
          { id: 'q1', type: 'field_report', data: {}, timestamp: Date.now() },
          { id: 'q2', type: 'stock_mutation', data: {}, timestamp: Date.now() }
        ]));
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      const queueBadge = page.locator('[data-queue-count]');
      await expect(queueBadge).toBeVisible();
      await expect(queueBadge).toContainText('2');
    });

    test('allows manual retry of failed items', async ({ page }) => {
      await page.route('**/rest/v1/field_reports*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            body: JSON.stringify({ id: 'fr-retry-001', status: 'Draft' })
          });
        } else {
          await route.fulfill({ status: 200, body: JSON.stringify([]) });
        }
      });

      await page.goto('/settings');

      // Add failed item to queue
      await page.evaluate(() => {
        localStorage.setItem('offline-queue', JSON.stringify([{
          id: 'queue-failed',
          type: 'field_report',
          data: { title: 'Failed Report', content: 'Content' },
          timestamp: Date.now(),
          retries: 3,
          lastError: 'Network error'
        }]));
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      // Open queue management
      const queueButton = page.getByRole('button', { name: /Antrian Offline/i });
      await queueButton.click();

      // Retry button
      const retryButton = page.getByRole('button', { name: /Coba Lagi/i }).first();
      await retryButton.click();

      await page.waitForTimeout(1000);

      // Success toast
      const successToast = page.locator('[role="alert"]').filter({ hasText: /berhasil disinkronkan/i });
      await expect(successToast).toBeVisible();
    });

    test('allows clearing failed queue items', async ({ page }) => {
      await page.goto('/settings');

      await page.evaluate(() => {
        localStorage.setItem('offline-queue', JSON.stringify([{
          id: 'queue-clear',
          type: 'field_report',
          data: {},
          timestamp: Date.now(),
          retries: 5
        }]));
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      const queueButton = page.getByRole('button', { name: /Antrian Offline/i });
      await queueButton.click();

      const clearButton = page.getByRole('button', { name: /Hapus/i }).first();
      await clearButton.click();

      // Confirm deletion
      const confirmButton = page.getByRole('button', { name: /Konfirmasi/i });
      await confirmButton.click();

      await page.waitForTimeout(500);

      // Queue should be empty
      const queueData = await page.evaluate(() => {
        return localStorage.getItem('offline-queue');
      });

      const queue = queueData ? JSON.parse(queueData) : [];
      expect(queue).toHaveLength(0);
    });
  });
});
