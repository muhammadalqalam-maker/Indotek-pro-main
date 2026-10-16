import { expect, type Page } from '@playwright/test';

const defaultMockUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'test@indotek.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  user_metadata: { full_name: 'Test User' },
  app_metadata: { providers: ['email'] },
};

export async function mockSupabaseRestFallback(page: Page): Promise<void> {
  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
      headers: { 'Content-Range': '0-0/0' },
    });
  });
}

export async function mockWorkspaceProject(page: Page): Promise<void> {
  await page.route('**/rest/v1/projects*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'proj-001',
        workspace_id: 'ws-test',
        name: 'Gedung Kantor Pusat',
        code: 'GKP-2026',
        client: 'PT Indotek',
        location: 'Jakarta Selatan',
        contract_value: 500000000000,
        approved_budget: 250000000000,
        status: 'Berjalan',
        progress_actual: 35,
        progress_planned: 40,
      }]),
    });
  });
}

export async function mockWorkspaceMaterial(page: Page): Promise<void> {
  await page.route('**/rest/v1/materials*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: '00000000-0000-4000-8000-000000000010',
        workspace_id: 'ws-test',
        code: 'MAT-001',
        name: 'Semen Portland',
        specification: '50 kg',
        category: 'Semen & Pasir',
        unit: 'sak',
        current_stock: 50,
        min_stock: 10,
        allocated_project_id: 'proj-001',
        warehouse_location: 'Gudang A',
        primary_supplier: 'PT Bahan Bangunan',
        unit_price: 80000,
        last_restocked: '2026-10-15T00:00:00Z',
        status: 'Aman',
      }]),
      headers: { 'Content-Range': '0-0/1' },
    });
  });
}

export async function authenticateTestPage(
  page: Page,
  options: {
    withWorkspace?: boolean;
    userId?: string;
    email?: string;
    fullName?: string;
    role?: string;
    workspaceId?: string;
  } = {},
): Promise<void> {
  const mockUser = {
    ...defaultMockUser,
    id: options.userId || defaultMockUser.id,
    email: options.email || defaultMockUser.email,
    user_metadata: { full_name: options.fullName || defaultMockUser.user_metadata.full_name },
  };
  const mockAccessToken = [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    Buffer.from(JSON.stringify({
      sub: mockUser.id,
      aud: 'authenticated',
      role: 'authenticated',
      exp: 1893456000,
      email: mockUser.email,
    })).toString('base64url'),
    'mock-signature',
  ].join('.');

  await page.routeWebSocket('**/realtime/v1/websocket*', () => {});

  await page.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/user') && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/rest/v1/profiles*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: mockUser.id,
        email: mockUser.email,
        full_name: mockUser.user_metadata.full_name,
        nip: '12345',
      }]),
      headers: { 'Content-Range': '0-0/1' },
    });
  });

  await page.route('**/rest/v1/workspace_members*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.withWorkspace === false ? [] : [{
        id: 'member-1',
        user_id: mockUser.id,
        workspace_id: options.workspaceId || 'ws-test',
        role: options.role || 'owner',
        status: 'Aktif',
        all_projects: true,
        created_at: '2026-01-01T00:00:00Z',
      }]),
      headers: {
        'Content-Range': options.withWorkspace === false ? '0-0/0' : '0-0/1',
      },
    });
  });

  const hash = new URLSearchParams({
    access_token: mockAccessToken,
    refresh_token: 'mock-refresh-token',
    expires_in: '3600',
    token_type: 'bearer',
    type: 'bearer',
  });
  await page.goto(`/#${hash.toString()}`);
  if (options.withWorkspace === false) {
    await expect(page.getByRole('heading', { name: /Selamat Datang/ })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: 'Dashboard Monitoring Portofolio' })).toBeVisible();
  }
}
