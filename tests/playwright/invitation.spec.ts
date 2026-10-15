import { test, expect } from '@playwright/test';

test.describe('Invitation Flow', () => {
  test.beforeEach(async ({ page }) => {
    const mockUser = {
      id: 'test-owner-id',
      email: 'owner@example.com',
      role: 'authenticated',
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: 'Test Owner' },
    };

    const mockSession = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: mockUser,
    };

    // Inject Supabase session into localStorage
    await page.addInitScript((session) => {
      const storageKey = 'sb-project.supabase.co-auth-token';
      localStorage.setItem(storageKey, JSON.stringify(session));
    }, mockSession);

    // Intercept auth API calls
    await page.route('**/auth/v1/**', async (route) => {
      const url = route.request().url();

      if (url.includes('/session')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { session: mockSession }, error: null }),
        });
      } else if (url.includes('/user')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUser),
        });
      } else {
        await route.continue();
      }
    });

    // Intercept user profile query
    await page.route('**/rest/v1/users*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'test-owner-id',
          email: 'owner@example.com',
          full_name: 'Test Owner',
          role: 'owner',
          workspace_id: 'test-workspace-id',
        }]),
        headers: {
          'Content-Range': '0-0/1',
        },
      });
    });

    // Intercept workspace membership query
    await page.route('**/rest/v1/workspace_members*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          workspace_id: 'test-workspace-id',
          user_id: 'test-owner-id',
          role: 'owner',
          status: 'Aktif',
        }]),
        headers: {
          'Content-Range': '0-0/1',
        },
      });
    });

    // Intercept projects query
    await page.route('**/rest/v1/projects*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'project-1',
          name: 'Project A',
          workspace_id: 'test-workspace-id',
        }]),
        headers: {
          'Content-Range': '0-0/1',
        },
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Invite Modal Form', () => {
    test('opens invite modal from team screen', async ({ page }) => {
      // Navigate to Team screen
      await page.click('[href="/team"]');
      await page.waitForLoadState('networkidle');

      // Click "Undang Member" button
      await page.click('button:has-text("Undang Member")');

      // Verify modal is visible
      const modal = page.locator('[role="dialog"]').filter({ hasText: 'Undang Member Baru' });
      await expect(modal).toBeVisible();
    });

    test('submits invite form with valid data', async ({ page }) => {
      // Setup API intercept for POST /api/invite-member
      let inviteRequestBody: any;
      await page.route('**/api/invite-member', async (route) => {
        if (route.request().method() === 'POST') {
          inviteRequestBody = route.request().postDataJSON();
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              message: 'Undangan telah dikirim',
              token: 'mock-invite-token-123456',
            }),
          });
        } else {
          await route.continue();
        }
      });

      // Navigate to Team screen
      await page.click('[href="/team"]');
      await page.waitForLoadState('networkidle');

      // Open invite modal
      await page.click('button:has-text("Undang Member")');

      // Fill form fields
      await page.fill('input[name="name"]', 'John Doe');
      await page.fill('input[name="email"]', 'john@example.com');
      await page.fill('input[name="nip"]', '12345678');
      await page.selectOption('select[name="role"]', 'project_manager');
      await page.fill('input[name="phone"]', '081234567890');
      await page.fill('input[name="department"]', 'Engineering');

      // Check assigned project checkbox
      const projectCheckbox = page.locator('label:has-text("Project A") input[type="checkbox"]');
      await projectCheckbox.check();

      // Submit form
      await page.click('button:has-text("Kirim Undangan")');

      // Verify API was called with correct data
      await page.waitForTimeout(500);
      expect(inviteRequestBody).toBeDefined();
      expect(inviteRequestBody.email).toBe('john@example.com');
      expect(inviteRequestBody.name).toBe('John Doe');
      expect(inviteRequestBody.nip).toBe('12345678');
      expect(inviteRequestBody.role).toBe('project_manager');

      // Verify success toast appears
      const successToast = page.locator('text=Undangan telah dikirim');
      await expect(successToast).toBeVisible();

      // Verify modal closes
      const modal = page.locator('[role="dialog"]');
      await expect(modal).not.toBeVisible();
    });

    test('displays validation errors for invalid email', async ({ page }) => {
      // Navigate to Team screen
      await page.click('[href="/team"]');
      await page.waitForLoadState('networkidle');

      // Open invite modal
      await page.click('button:has-text("Undang Member")');

      // Fill form with invalid email
      await page.fill('input[name="name"]', 'John Doe');
      await page.fill('input[name="email"]', 'invalid-email');
      await page.fill('input[name="nip"]', '12345678');

      // Try to submit
      await page.click('button:has-text("Kirim Undangan")');

      // Verify validation error appears
      const emailError = page.locator('text=/Email tidak valid|Invalid email/i');
      await expect(emailError).toBeVisible();
    });

    test('handles API error gracefully', async ({ page }) => {
      // Setup API to return error
      await page.route('**/api/invite-member', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Email sudah terdaftar dalam workspace',
          }),
        });
      });

      // Navigate to Team screen
      await page.click('[href="/team"]');
      await page.waitForLoadState('networkidle');

      // Open invite modal
      await page.click('button:has-text("Undang Member")');

      // Fill and submit form
      await page.fill('input[name="name"]', 'John Doe');
      await page.fill('input[name="email"]', 'existing@example.com');
      await page.fill('input[name="nip"]', '12345678');
      await page.selectOption('select[name="role"]', 'project_manager');

      await page.click('button:has-text("Kirim Undangan")');

      // Verify error toast appears
      const errorToast = page.locator('text=Email sudah terdaftar dalam workspace');
      await expect(errorToast).toBeVisible({ timeout: 5000 });

      // Verify modal still open for retry
      const modal = page.locator('[role="dialog"]').filter({ hasText: 'Undang Member Baru' });
      await expect(modal).toBeVisible();
    });
  });

  test.describe('Accept Invitation Page', () => {
    test('displays pending status for non-Aktif member', async ({ page }) => {
      // Setup pending user session (not yet verified)
      const pendingUser = {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'pending@example.com',
        role: 'authenticated',
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Pending User' },
      };

      const pendingSession = {
        access_token: 'mock-pending-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: pendingUser,
      };

      // Override session for this test
      await page.addInitScript((session) => {
        const storageKey = 'sb-project.supabase.co-auth-token';
        localStorage.setItem(storageKey, JSON.stringify(session));
      }, pendingSession);

      // Intercept workspace_members query to return pending status
      await page.route('**/rest/v1/workspace_members*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            workspace_id: 'test-workspace-id',
            user_id: '00000000-0000-0000-0000-000000000000',
            role: 'project_manager',
            status: 'Pending',
          }]),
          headers: {
            'Content-Range': '0-0/1',
          },
        });
      });

      // Navigate to home
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Should show pending approval screen
      const pendingMessage = page.locator('text=/Akun menunggu persetujuan|Menunggu persetujuan/i');
      await expect(pendingMessage).toBeVisible();
    });

    test('accepts invitation with valid token', async ({ page }) => {
      // Setup mock RPC response for accept_invitation
      await page.route('**/rest/v1/rpc/accept_invitation', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Undangan diterima',
          }),
        });
      });

      // Navigate to terima-undangan page with valid token
      await page.goto('/terima-undangan?token=mock-invite-token-123456');
      await page.waitForLoadState('networkidle');

      // Verify page title
      const pageTitle = page.locator('text=/Terima Undangan|Accept Invitation/i');
      await expect(pageTitle).toBeVisible();

      // Verify accept button is visible
      const acceptButton = page.locator('button:has-text(/Terima|Accept/)');
      await expect(acceptButton).toBeVisible();

      // Click accept button
      await acceptButton.click();

      // Verify success message
      const successMessage = page.locator('text=/Terima kasih|Berhasil/i');
      await expect(successMessage).toBeVisible({ timeout: 5000 });
    });

    test('displays error for invalid token', async ({ page }) => {
      // Setup mock RPC to return error for invalid token
      await page.route('**/rest/v1/rpc/accept_invitation', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Token tidak valid atau sudah kadaluarsa',
          }),
        });
      });

      // Navigate with invalid token
      await page.goto('/terima-undangan?token=invalid-token');
      await page.waitForLoadState('networkidle');

      // Verify error message
      const errorMessage = page.locator('text=/tidak valid|kadaluarsa|Invalid|Expired/i');
      await expect(errorMessage).toBeVisible();

      // Verify button is disabled or shows retry option
      const actionButton = page.locator('button');
      const isDisabled = await actionButton.evaluate((btn) => (btn as HTMLButtonElement).disabled);
      const buttonCount = await actionButton.count();
      expect(isDisabled || buttonCount === 0).toBeTruthy();
    });

    test('displays error for missing token', async ({ page }) => {
      // Navigate without token parameter
      await page.goto('/terima-undangan');
      await page.waitForLoadState('networkidle');

      // Verify error message
      const errorMessage = page.locator('text=/Token tidak ditemukan|Token missing/i');
      await expect(errorMessage).toBeVisible();
    });
  });

  test.describe('Invitation Status Flow', () => {
    test('updates team member status after accepting invitation', async ({ page }) => {
      let rpcCallCount = 0;

      // Track RPC calls
      await page.route('**/rest/v1/rpc/accept_invitation', async (route) => {
        rpcCallCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            workspace_id: 'test-workspace-id',
            user_id: 'invited-user-id',
            status: 'Aktif',
          }),
        });
      });

      // Navigate to accept invitation
      await page.goto('/terima-undangan?token=mock-invite-token-123456');
      await page.waitForLoadState('networkidle');

      // Accept invitation
      const acceptButton = page.locator('button:has-text(/Terima|Accept/)');
      await acceptButton.click();

      // Verify RPC was called
      await page.waitForTimeout(500);
      expect(rpcCallCount).toBe(1);

      // Verify success message
      const successMessage = page.locator('text=/Berhasil|Success/i');
      await expect(successMessage).toBeVisible();
    });

    test('prevents duplicate invitation acceptance', async ({ page }) => {
      let acceptCallCount = 0;

      await page.route('**/rest/v1/rpc/accept_invitation', async (route) => {
        acceptCallCount++;
        if (acceptCallCount === 1) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, status: 'Aktif' }),
          });
        } else {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Token sudah digunakan',
            }),
          });
        }
      });

      // Navigate to accept invitation
      await page.goto('/terima-undangan?token=mock-invite-token-123456');
      await page.waitForLoadState('networkidle');

      // First accept
      const acceptButton = page.locator('button:has-text(/Terima|Accept/)');
      await acceptButton.click();
      await page.waitForTimeout(500);

      // Try to accept again (should fail or button should be disabled)
      const secondAcceptButton = page.locator('button:has-text(/Terima|Accept/)');
      const isDisabled = await secondAcceptButton.evaluate((btn) => (btn as HTMLButtonElement).disabled);
      
      if (!isDisabled && await secondAcceptButton.isVisible()) {
        await secondAcceptButton.click();
        
        // Verify error appears
        const errorMessage = page.locator('text=/sudah digunakan|already used/i');
        await expect(errorMessage).toBeVisible({ timeout: 5000 });
      }
    });
  });
});
