/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Centralized Bilingual (ID / EN) Translation Engine
 * Activated by corporate settings: workspaces/{wsId}/settings.language
 * Default language: 'id'
 */

export type AppLanguage = 'id' | 'en';

export const TRANSLATIONS = {
  id: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.projects': 'Portofolio Proyek',
    'nav.schedule': 'Jadwal & Kurva-S',
    'nav.budget': 'RAB & Pengendalian Biaya',
    'nav.materials': 'Logistik & Material',
    'nav.procurement': 'Pengadaan & PO',
    'nav.fieldReports': 'Laporan Harian Lapangan',
    'nav.team': 'Manajemen Tim & RBAC',
    'nav.reports': 'Laporan Eksekutif',
    'nav.settings': 'Pengaturan & Audit',

    // Common Actions
    'action.save': 'Simpan Perubahan',
    'action.cancel': 'Batal',
    'action.reset': 'Reset',
    'action.delete': 'Hapus',
    'action.edit': 'Ubah',
    'action.create': 'Buat Baru',
    'action.search': 'Cari...',
    'action.filter': 'Filter',
    'action.export': 'Ekspor Data',
    'action.retry': 'Coba Lagi',
    'action.approve': 'Setujui',
    'action.reject': 'Tolak',
    'action.submit': 'Ajukan',
    'action.close': 'Tutup',
    'action.refresh': 'Muat Ulang',
    'action.back': 'Kembali',
    'action.download': 'Unduh',
    'action.viewDetail': 'Lihat Detail',
    'action.confirm': 'Konfirmasi',

    // States
    'state.loading': 'Memuat data...',
    'state.empty': 'Tidak ada data',
    'state.error': 'Terjadi kesalahan sistem',
    'state.syncing': 'Menyinkronkan...',
    'state.success': 'Berhasil',

    // Settings
    'settings.title': 'Pengaturan & Tata Kelola Workspace',
    'settings.subtitle': 'Sesuaikan identitas badan usaha, format mata uang, ambang batas alert, dan auditabilitas korporat',
    'settings.ownerOnly': 'Hanya Owner / Director yang berwenang mengubah konfigurasi perusahaan.',
    'settings.companyProfile': 'Profil Perusahaan',
    'settings.regional': 'Format & Bahasa',
    'settings.notifications': 'Peringatan & Alert',
    'settings.appearance': 'Kerapatan & Tampilan',
    'settings.audit': 'Jejak Audit & Tata Kelola',
    'settings.savedSuccess': 'Pengaturan perusahaan berhasil disimpan ke Firestore.',

    // Budget
    'budget.title': 'RAB & Pengendalian Biaya',
    'budget.versionHistory': 'Riwayat Versi RAB & Addendum',
    'budget.compareBeforeAfter': 'Komparasi Sebelum & Sesudah',
    'budget.rabLines': 'Rincian Item Pekerjaan RAB / BOQ',
    'budget.addendumRevisions': 'Addendum Revisi Anggaran',
    'budget.pettyCash': 'Kas Kecil Proyek',
    'budget.totalBudget': 'Total Anggaran Disetujui',
    'budget.actualCost': 'Realisasi Biaya Aktual',
    'budget.costVariance': 'Varians Biaya',
    'budget.remainingHeadroom': 'Sisa Plafon Anggaran',
    'budget.addBOQItem': 'Tambah Item Pekerjaan',

    // Materials
    'materials.title': 'Inventaris & Logistik Material',
    'materials.subtitle': 'Pantau stok fisik gudang site, mutasi penerimaan/pengeluaran, dan audit opname berkala',
    'materials.stockList': 'Daftar Stok Material',
    'materials.mutations': 'Mutasi Masuk & Keluar',
    'materials.adjustments': 'Opname Fisik & Penyesuaian',
    'materials.criticalStock': 'Stok Kritis',
    'materials.recordMutation': 'Catat Mutasi',
    'materials.stockOpname': 'Ajukan Stock Opname',

    // Procurement
    'procurement.title': 'Pengadaan & Purchase Order (PO)',
    'procurement.subtitle': 'Kelola alur PO multi-tingkat, verifikasi vendor, dan kepatuhan anggaran proyek',
    'procurement.createPO': 'Buat Purchase Order',
    'procurement.poList': 'Daftar Purchase Order',
    'procurement.pendingApproval': 'Menunggu Persetujuan',
    'procurement.approved': 'Disetujui',
    'procurement.rejected': 'Ditolak',

    // Field Reports
    'fieldReports.title': 'Laporan Harian Lapangan (BHL)',
    'fieldReports.subtitle': 'Dokumentasi progres harian, tenaga kerja, kondisi cuaca, dan verifikasi site engineer',
    'fieldReports.createReport': 'Buat Laporan Baru',
    'fieldReports.weather': 'Kondisi Cuaca',
    'fieldReports.manpower': 'Alokasi Tenaga Kerja',
    'fieldReports.workItems': 'Uraian Pekerjaan',
    'fieldReports.photos': 'Dokumentasi Foto Fisik Lapangan',

    // Team
    'team.title': 'Manajemen Tim & RBAC',
    'team.subtitle': 'Kelola akses personel proyek, pembagian peran kerja (SoD), dan penugasan proyek',
    'team.inviteMember': 'Undang Anggota',
    'team.roleMatrix': 'Matriks Hak Akses (RBAC)',
    'team.activeMembers': 'Anggota Aktif',

    // Projects
    'projects.title': 'Portofolio Proyek',
    'projects.subtitle': 'Pantau portofolio konstruksi, deviasi jadwal, dan realisasi anggaran multi-site',
    'projects.addProject': 'Tambah Proyek Baru',
    'projects.active': 'Proyek Berjalan',
    'projects.completed': 'Selesai',
    'projects.onHold': 'Tertunda',

    // Schedule
    'schedule.title': 'Jadwal Pelaksanaan & Kurva-S',
    'schedule.subtitle': 'Analisis deviasi progres rencana vs realisasi, jalur kritis WBS, dan BAST milestone',

    // Reports
    'reports.title': 'Laporan Eksekutif & Analitik',
    'reports.subtitle': 'Kompilasi ringkasan performa finansial, progres fisik, dan audit transaksi korporat',

    // Accessibility & Pagination
    'a11y.pagination': 'Navigasi Halaman',
    'a11y.previousPage': 'Halaman Sebelumnya',
    'a11y.nextPage': 'Halaman Berikutnya',
    'a11y.pageNumber': 'Halaman {page}',
    'a11y.closeModal': 'Tutup Dialog',
    'a11y.search': 'Pencarian kata kunci',
    'a11y.clearSearch': 'Hapus pencarian',
  },
  en: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.projects': 'Project Portfolio',
    'nav.schedule': 'Schedule & S-Curve',
    'nav.budget': 'BOQ & Budget Control',
    'nav.materials': 'Logistics & Materials',
    'nav.procurement': 'Procurement & PO',
    'nav.fieldReports': 'Daily Field Reports',
    'nav.team': 'Team & RBAC Governance',
    'nav.reports': 'Executive Reports',
    'nav.settings': 'Settings & Audit',

    // Common Actions
    'action.save': 'Save Changes',
    'action.cancel': 'Cancel',
    'action.reset': 'Reset',
    'action.delete': 'Delete',
    'action.edit': 'Edit',
    'action.create': 'Create New',
    'action.search': 'Search...',
    'action.filter': 'Filter',
    'action.export': 'Export Data',
    'action.retry': 'Retry',
    'action.approve': 'Approve',
    'action.reject': 'Reject',
    'action.submit': 'Submit',
    'action.close': 'Close',
    'action.refresh': 'Refresh',
    'action.back': 'Back',
    'action.download': 'Download',
    'action.viewDetail': 'View Detail',
    'action.confirm': 'Confirm',

    // States
    'state.loading': 'Loading data...',
    'state.empty': 'No data available',
    'state.error': 'A system error occurred',
    'state.syncing': 'Synchronizing...',
    'state.success': 'Success',

    // Settings
    'settings.title': 'Workspace Settings & Governance',
    'settings.subtitle': 'Configure corporate entity identity, currency formats, alert thresholds, and enterprise auditability',
    'settings.ownerOnly': 'Only Owner / Director is authorized to modify corporate configurations.',
    'settings.companyProfile': 'Company Profile',
    'settings.regional': 'Formats & Language',
    'settings.notifications': 'Warnings & Alerts',
    'settings.appearance': 'Density & Appearance',
    'settings.audit': 'Audit Trail & Governance',
    'settings.savedSuccess': 'Company settings successfully saved to Firestore.',

    // Budget
    'budget.title': 'BOQ & Budget Control',
    'budget.versionHistory': 'BOQ Version History & Addenda',
    'budget.compareBeforeAfter': 'Before vs After Comparison',
    'budget.rabLines': 'BOQ / RAB Itemized Lines',
    'budget.addendumRevisions': 'Budget Revision Addenda',
    'budget.pettyCash': 'Site Petty Cash',
    'budget.totalBudget': 'Total Approved Budget',
    'budget.actualCost': 'Actual Realized Cost',
    'budget.costVariance': 'Cost Variance',
    'budget.remainingHeadroom': 'Remaining Budget Headroom',
    'budget.addBOQItem': 'Add BOQ Line Item',

    // Materials
    'materials.title': 'Materials Inventory & Logistics',
    'materials.subtitle': 'Monitor site physical warehouse stocks, inbound/outbound mutations, and periodic physical stocktake audits',
    'materials.stockList': 'Materials Stock List',
    'materials.mutations': 'Inbound & Outbound Mutations',
    'materials.adjustments': 'Physical Stocktake Adjustments',
    'materials.criticalStock': 'Critical Stock Alerts',
    'materials.recordMutation': 'Record Mutation',
    'materials.stockOpname': 'Submit Stocktake Adjustment',

    // Procurement
    'procurement.title': 'Procurement & Purchase Orders (PO)',
    'procurement.subtitle': 'Manage multi-tier PO approval pipelines, vendor verifications, and project budget headroom compliance',
    'procurement.createPO': 'Create Purchase Order',
    'procurement.poList': 'Purchase Order List',
    'procurement.pendingApproval': 'Pending Approval',
    'procurement.approved': 'Approved',
    'procurement.rejected': 'Rejected',

    // Field Reports
    'fieldReports.title': 'Daily Field Reports',
    'fieldReports.subtitle': 'Log daily physical progress, site workforce allocation, weather logs, and site engineer signoffs',
    'fieldReports.createReport': 'Create Daily Report',
    'fieldReports.weather': 'Weather Conditions',
    'fieldReports.manpower': 'Manpower Allocation',
    'fieldReports.workItems': 'Work Descriptions',
    'fieldReports.photos': 'Field Documentation Photos',

    // Team
    'team.title': 'Team & RBAC Governance',
    'team.subtitle': 'Manage enterprise personnel access, Segregation of Duties (SoD), and project assignments',
    'team.inviteMember': 'Invite Member',
    'team.roleMatrix': 'RBAC Permissions Matrix',
    'team.activeMembers': 'Active Members',

    // Projects
    'projects.title': 'Project Portfolio',
    'projects.subtitle': 'Monitor multi-site construction portfolio, schedule deviations, and budget expenditures',
    'projects.addProject': 'Add New Project',
    'projects.active': 'Active Projects',
    'projects.completed': 'Completed',
    'projects.onHold': 'On Hold',

    // Schedule
    'schedule.title': 'Schedule & S-Curve',
    'schedule.subtitle': 'Analyze planned vs actual progress curves, critical WBS paths, and milestone handovers',

    // Reports
    'reports.title': 'Executive Reports & Analytics',
    'reports.subtitle': 'Compiled corporate financial analytics, physical progress summaries, and transactional audit trails',

    // Accessibility & Pagination
    'a11y.pagination': 'Page Navigation',
    'a11y.previousPage': 'Previous Page',
    'a11y.nextPage': 'Next Page',
    'a11y.pageNumber': 'Page {page}',
    'a11y.closeModal': 'Close Dialog',
    'a11y.search': 'Keyword search',
    'a11y.clearSearch': 'Clear search',
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS['id'];

/**
 * Translate a key into the given language with Indonesian ('id') as the robust default.
 */
export function t(key: TranslationKey | string, lang: AppLanguage = 'id', fallback?: string): string {
  const selectedDict = (TRANSLATIONS as any)[lang] || TRANSLATIONS['id'];
  const fallbackDict = TRANSLATIONS['id'];
  
  if (selectedDict && selectedDict[key]) {
    return selectedDict[key];
  }
  if (fallbackDict && (fallbackDict as any)[key]) {
    return (fallbackDict as any)[key];
  }
  return fallback || key;
}
