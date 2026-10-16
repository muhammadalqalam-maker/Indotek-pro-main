import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/dataService', () => ({
  dataService: {},
  resolveWorkspaceId: () => 'workspace-uuid',
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({}),
}));

import { getScreenIdFromPathname } from './UIContext';

describe('getScreenIdFromPathname', () => {
  it.each([
    ['/proyek', 'projects'],
    ['/proyek/project-123/budget', 'project-detail'],
    ['/jadwal', 'schedule'],
    ['/anggaran', 'budget'],
    ['/harga-dasar', 'resource-prices'],
    ['/ahsp', 'ahsp-templates'],
    ['/material', 'materials'],
    ['/pengadaan', 'procurement'],
    ['/laporan-harian', 'field-reports'],
    ['/tim', 'team'],
    ['/laporan', 'reports'],
    ['/pengaturan', 'settings'],
    ['/projects/project-123/field-reports', 'project-detail'],
    ['/field-report', 'field-reports'],
  ])('maps %s to screen %s', (pathname, screenId) => {
    expect(getScreenIdFromPathname(pathname)).toBe(screenId);
  });
});
