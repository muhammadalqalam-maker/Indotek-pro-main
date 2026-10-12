import React, { useState, useMemo } from 'react';
import {
  Plus,
  ArrowUpDown,
  Search,
  Filter,
  ArrowUpRight,
  MapPin,
  Calendar,
  Building,
  RotateCcw
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Project, ProjectCategory, ProjectStatus } from '../../types';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { ProgressBar } from '../common/ProgressBar';
import { SearchInput } from '../common/SearchInput';
import { EmptyState } from '../common/EmptyState';
import { Pagination } from '../common/Pagination';
import {
  formatCurrencyIDR,
  formatCompactIDR,
  formatPercent,
  formatDateIndo
} from '../../utils/formatters';

type SortField = 'name' | 'contractValue' | 'progressActual' | 'startDate';
type SortOrder = 'asc' | 'desc';

export const ProjectsScreen: React.FC = () => {
  const { projects, navigateToProjectDetail, setIsAddProjectModalOpen } = useApp();

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('Semua');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [sortField, setSortField] = useState<SortField>('progressActual');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        p.client.toLowerCase().includes(search.toLowerCase()) ||
        p.location.toLowerCase().includes(search.toLowerCase()) ||
        p.projectManager.toLowerCase().includes(search.toLowerCase());

      const matchStatus =
        selectedStatus === 'Semua' || p.status === selectedStatus;

      const matchCategory =
        selectedCategory === 'Semua' || p.category === selectedCategory;

      return matchSearch && matchStatus && matchCategory;
    });
  }, [projects, search, selectedStatus, selectedCategory]);

  const sortedProjects = useMemo(() => {
    return [...filteredProjects].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? (valA as string).localeCompare(valB as string)
          : (valB as string).localeCompare(valA as string);
      }

      return sortOrder === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
  }, [filteredProjects, sortField, sortOrder]);

  const totalPages = Math.ceil(sortedProjects.length / pageSize) || 1;
  const paginatedProjects = sortedProjects.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const resetFilters = () => {
    setSearch('');
    setSelectedStatus('Semua');
    setSelectedCategory('Semua');
    setCurrentPage(1);
  };

  const statusCounts = useMemo(() => {
    return {
      Semua: projects.length,
      Berjalan: projects.filter((p) => p.status === 'Berjalan').length,
      Selesai: projects.filter((p) => p.status === 'Selesai').length,
      'Pra-Konstruksi': projects.filter((p) => p.status === 'Pra-Konstruksi').length,
    };
  }, [projects]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8E4]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#69766F] mb-1">
            <span>Portofolio Kontrak</span>
            <span aria-hidden="true">·</span>
            <span>Total {projects.length} Proyek Terdaftar</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26]">
            Daftar Portofolio Proyek
          </h1>
          <p className="text-xs text-[#69766F] mt-0.5">
            Kelola dan pantau seluruh proyek konstruksi, status kontrak, jadwal, dan progres fisik
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsAddProjectModalOpen(true)}
          className="self-start sm:self-auto"
        >
          Tambah Proyek Baru
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8E4] shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {(['Semua', 'Berjalan', 'Pra-Konstruksi', 'Selesai'] as const).map((status) => {
              const isActive = selectedStatus === status;
              const count = statusCounts[status] || 0;
              return (
                <button
                  key={status}
                  onClick={() => {
                    setSelectedStatus(status);
                    setCurrentPage(1);
                  }}
                  className={`h-9 px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? 'bg-[#12352B] text-white shadow-2xs font-semibold'
                      : 'text-[#69766F] hover:bg-[#F5F7F6] hover:text-[#202B26]'
                  }`}
                >
                  <span>{status}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono tabular-nums ${
                      isActive ? 'bg-[#285744] text-white' : 'bg-[#EAEFEA] text-[#69766F]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input & Category Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setCurrentPage(1);
              }}
              placeholder="Cari nama, kode, klien, atau PM..."
              className="w-full sm:w-64"
            />

            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 bg-white border border-[#E2E8E4] rounded-lg px-3 text-xs font-medium text-[#202B26] hover:border-[#CBD5CF] focus:outline-none focus:border-[#12352B] focus:ring-1 focus:ring-[#12352B] transition-colors cursor-pointer"
            >
              <option value="Semua">Semua Kategori</option>
              <option value="Komersial">Komersial</option>
              <option value="Infrastruktur">Infrastruktur</option>
              <option value="Residensial">Residensial</option>
              <option value="Industri">Industri</option>
            </select>
          </div>
        </div>
      </div>

      {/* Projects Table / Empty State */}
      {paginatedProjects.length === 0 ? (
        <EmptyState
          title="Tidak Ada Proyek Ditemukan"
          description={`Pencarian untuk "${search || selectedStatus}" tidak menghasilkan data proyek.`}
          actionLabel="Reset Filter & Tampilkan Semua"
          onAction={resetFilters}
          icon={<RotateCcw className="w-6 h-6" />}
        />
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                  <th
                    className="py-3 px-4 font-semibold cursor-pointer hover:text-[#202B26] select-none text-left"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Nama Proyek & Kode</span>
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </div>
                  </th>
                  <th className="py-3 px-4 font-semibold text-left hidden md:table-cell">Klien & Lokasi</th>
                  <th className="py-3 px-4 font-semibold text-left hidden lg:table-cell">Project Manager</th>
                  <th
                    className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-[#202B26] select-none"
                    onClick={() => handleSort('contractValue')}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Nilai Kontrak</span>
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 font-semibold text-left cursor-pointer hover:text-[#202B26] select-none"
                    onClick={() => handleSort('progressActual')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Progres Fisik</span>
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </div>
                  </th>
                  <th className="py-3 px-4 font-semibold text-left">Status Jadwal</th>
                  <th className="py-3 px-4 font-semibold text-left hidden sm:table-cell">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8E4]/70">
                {paginatedProjects.map((project) => {
                  const scheduleVariant =
                    project.scheduleStatus === 'Tepat Waktu'
                      ? 'success'
                      : project.scheduleStatus === 'Kritis'
                      ? 'warning'
                      : 'danger';

                  const statusVariant =
                    project.status === 'Berjalan'
                      ? 'primary'
                      : project.status === 'Selesai'
                      ? 'success'
                      : 'neutral';

                  return (
                    <tr
                      key={project.id}
                      onClick={() => navigateToProjectDetail(project.id)}
                      className="hover:bg-[#F5F7F6]/80 transition-colors group cursor-pointer"
                    >
                      <td className="py-3.5 px-4 min-w-[200px]">
                        <div className="font-bold text-[#202B26] group-hover:text-[#12352B] transition-colors leading-snug">
                          {project.name}
                        </div>
                        <div className="text-[11px] text-[#69766F] font-mono mt-0.5 tabular-nums">
                          {project.code} · {project.category}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 hidden md:table-cell">
                        <div className="font-medium text-[#202B26] truncate max-w-[160px]">
                          {project.client}
                        </div>
                        <div className="text-[11px] text-[#69766F] truncate max-w-[160px] flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span>{project.location}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-[#4F5D56] hidden lg:table-cell">
                        <div className="font-medium text-[#202B26]">{project.projectManager}</div>
                        <div className="text-[11px] text-[#69766F]">
                          Site: {project.siteEngineer}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div className="font-mono font-bold text-[#202B26] tabular-nums">
                          {formatCurrencyIDR(project.contractValue)}
                        </div>
                        <div className="text-[11px] text-[#69766F] font-mono tabular-nums">
                          RAB: {formatCompactIDR(project.approvedBudget)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 min-w-[150px]">
                        <div className="flex items-center justify-between text-[11px] mb-1 font-mono tabular-nums">
                          <span className="font-bold text-[#202B26]">
                            {formatPercent(project.progressActual)}
                          </span>
                          <span className="text-[#69766F]">
                            Plan: {formatPercent(project.progressPlanned)}
                          </span>
                        </div>
                        <ProgressBar
                          value={project.progressActual}
                          planned={project.progressPlanned}
                          size="sm"
                          variant={
                            project.progressActual >= project.progressPlanned ? 'primary' : 'warning'
                          }
                        />
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Badge variant={scheduleVariant} size="sm" dot>
                          {project.scheduleStatus}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 hidden sm:table-cell whitespace-nowrap">
                        <Badge variant={statusVariant} size="sm">
                          {project.status}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateToProjectDetail(project.id);
                          }}
                          rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
                        >
                          Detail
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredProjects.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
};
