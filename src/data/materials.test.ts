import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authGetUser, from } = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: authGetUser },
    from,
  },
}));

import { getMaterials } from './materials';

describe('getMaterials', () => {
  beforeEach(() => {
    authGetUser.mockReset();
    from.mockReset();
  });

  it('maps Supabase material columns to the application model', async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: 'user-001' } },
    });

    const membershipQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: { workspace_id: 'workspace-001' },
        error: null,
      }),
    };
    membershipQuery.select.mockReturnValue(membershipQuery);
    membershipQuery.eq.mockReturnValue(membershipQuery);
    membershipQuery.limit.mockReturnValue(membershipQuery);

    const materialsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn().mockResolvedValue({
        data: [{
          id: 'material-001',
          workspace_id: 'workspace-001',
          code: 'MAT-001',
          name: 'Semen Portland',
          specification: '50 kg',
          category: 'Semen & Pasir',
          unit: 'sak',
          current_stock: '50.5',
          min_stock: '10',
          allocated_project_id: 'project-001',
          warehouse_location: 'Gudang A',
          primary_supplier: 'PT Bahan Bangunan',
          unit_price: '80000',
          last_restocked: '2026-10-15T00:00:00Z',
          status: 'Aman',
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-15T00:00:00Z',
        }],
        error: null,
      }),
    };
    materialsQuery.select.mockReturnValue(materialsQuery);
    materialsQuery.eq.mockReturnValue(materialsQuery);
    from.mockImplementation((table: string) => (
      table === 'workspace_members' ? membershipQuery : materialsQuery
    ));

    await expect(getMaterials()).resolves.toEqual([{
      id: 'material-001',
      workspaceId: 'workspace-001',
      code: 'MAT-001',
      name: 'Semen Portland',
      specification: '50 kg',
      category: 'Semen & Pasir',
      unit: 'sak',
      currentStock: 50.5,
      minStock: 10,
      allocatedProject: 'Semua Proyek',
      allocatedProjectId: 'project-001',
      warehouseLocation: 'Gudang A',
      primarySupplier: 'PT Bahan Bangunan',
      unitPrice: 80000,
      lastRestocked: '2026-10-15T00:00:00Z',
      status: 'Aman',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-15T00:00:00Z',
    }]);
  });
});
