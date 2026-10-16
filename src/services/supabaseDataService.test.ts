import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../types';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { rpc, from },
}));

import { supabaseDataService } from './supabaseDataService';

describe('supabaseDataService.addProject', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  describe('supabaseDataService.addFieldReport', () => {
    beforeEach(() => {
      rpc.mockReset();
    });

    it('uses the field-report RPC contract and returns the created report id', async () => {
      rpc.mockResolvedValue({
        data: { success: true, data: { id: 'report-uuid', reportNumber: 'LHP-001', status: 'Draft' } },
        error: null,
      });

      const report = {
        projectId: 'project-uuid',
        projectName: 'Proyek Uji',
        date: '2026-10-16',
        weatherMorning: 'Cerah' as const,
        weatherAfternoon: 'Berawan' as const,
        workingHours: 8,
        siteSupervisor: 'Pengawas Uji',
        workforce: [{ role: 'Tukang', count: 2 }],
        completedWorks: ['Pekerjaan struktur'],
        materialsUsed: [],
        equipmentUsed: [],
        blockers: '',
        photos: [],
      };

      await expect(
        supabaseDataService.addFieldReport(
          report,
          { actorName: 'Pengawas Uji', actorRole: 'Site Manager / Supervisor' },
          '11111111-1111-4111-8111-111111111111',
          'stable-idempotency-key'
        )
      ).resolves.toBe('report-uuid');

      expect(rpc).toHaveBeenCalledWith('create_field_report', {
        p_workspace_id: '11111111-1111-4111-8111-111111111111',
        p_project_id: 'project-uuid',
        p_report_date: '2026-10-16',
        p_site_supervisor_name: 'Pengawas Uji',
        p_weather_morning: 'Cerah',
        p_weather_afternoon: 'Berawan',
        p_working_hours: 8,
        p_workforce: [{ role: 'Tukang', count: 2 }],
        p_completed_works: ['Pekerjaan struktur'],
        p_materials_used: [],
        p_equipment_used: [],
        p_blockers: null,
        p_idempotency_key: 'stable-idempotency-key',
      });
    });

    describe('supabaseDataService.getPettyCashPaged', () => {
      beforeEach(() => {
        from.mockReset();
      });

      it('selects only columns present in the petty_cash schema', async () => {
        const query = {
          select: vi.fn(),
          eq: vi.fn(),
          order: vi.fn(),
          range: vi.fn(),
        };
        query.select.mockReturnValue(query);
        query.eq.mockReturnValue(query);
        query.order.mockReturnValue(query);
        const response = Promise.resolve({ data: [], error: null, count: 0 });
        Object.defineProperty(query, 'then', { value: response.then.bind(response) });
        query.range.mockReturnValue(query);
        from.mockReturnValue(query);

        await expect(supabaseDataService.getPettyCashPaged({ wsId: '11111111-1111-4111-8111-111111111111' }))
          .resolves.toEqual({ items: [], total: 0 });

        expect(from).toHaveBeenCalledWith('petty_cash');
        expect(query.select).toHaveBeenCalledWith(
          'id,workspace_id,legacy_id,petty_cash_no,project_id,category,purpose,receipt_path,amount,status,requester_id,requester_name,reviewed_by,reviewed_at,disbursed_by,disbursed_at,submitted_at,created_at,updated_at,rejection_reason,projects(name,legacy_id)',
          { count: 'exact' }
        );
      });
    });
  });

  it('calls the create_project RPC with the migrated signature and returns its project id', async () => {
    rpc.mockResolvedValue({
      data: { success: true, id: 'project-uuid', code: 'PRJ-001', name: 'Proyek Uji' },
      error: null,
    });

    const project: Omit<Project, 'id' | 'totalMilestones' | 'completedMilestones'> = {
      code: 'PRJ-001',
      name: 'Proyek Uji',
      client: 'Klien Uji',
      category: 'Komersial',
      location: 'Makassar',
      projectManager: 'Manajer Uji',
      siteEngineer: 'Site Engineer Uji',
      contractValue: 1_000_000_000,
      approvedBudget: 900_000_000,
      actualCost: 0,
      startDate: '2026-10-16',
      targetEndDate: '2027-10-16',
      progressActual: 0,
      progressPlanned: 0,
      status: 'Pra-Konstruksi',
      scheduleStatus: 'Tepat Waktu',
      description: 'Proyek untuk pengujian',
    };

    await expect(
      supabaseDataService.addProject(project, '5afb9797-5b33-48e6-ab33-e0c84d7c25f9')
    ).resolves.toBe('project-uuid');

    expect(rpc).toHaveBeenCalledWith('create_project', {
      p_workspace_id: '5afb9797-5b33-48e6-ab33-e0c84d7c25f9',
      p_name: 'Proyek Uji',
      p_code: 'PRJ-001',
      p_client: 'Klien Uji',
      p_category: 'Komersial',
      p_location: 'Makassar',
      p_project_manager: 'Manajer Uji',
      p_site_engineer: 'Site Engineer Uji',
      p_contract_value: 1_000_000_000,
      p_approved_budget: 900_000_000,
      p_start_date: '2026-10-16',
      p_target_end_date: '2027-10-16',
      p_status: 'Pra-Konstruksi',
      p_image_url: null,
      p_description: 'Proyek untuk pengujian',
    });
  });
});
