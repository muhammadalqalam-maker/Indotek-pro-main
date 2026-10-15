/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseEntity } from './index';

export type ResourceType = 'Bahan' | 'Upah' | 'Alat' | 'Subkon';

export interface ResourcePrice extends BaseEntity {
  jenis: ResourceType;
  kode: string;
  uraian: string;
  satuan: string;
  harga: number; // Bigint Rupiah direpresentasikan number aman di JS (hingga 9 kuadriliun)
  wilayah: string;
  berlakuMulai: string; // YYYY-MM-DD
  berlakuSampai?: string | null; // YYYY-MM-DD
  spesifikasi?: string | null;
}

export interface ResourcePriceFilter {
  jenis?: ResourceType | 'Semua';
  searchQuery?: string;
  wilayah?: string;
}

export interface ResourcePriceImportRow {
  kode: string;
  uraian: string;
  satuan: string;
  harga: number;
  jenis?: ResourceType;
  wilayah?: string;
  berlakuMulai?: string;
  spesifikasi?: string;
}

export interface ResourcePriceImportResult {
  success: boolean;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  message: string;
}

export type AHSPComponentType = 'Tenaga' | 'Bahan' | 'Alat' | 'Subkon';

export interface AHSPTemplate extends BaseEntity {
  kode: string;
  nama: string;
  satuan: string;
  kategori: string;
  overheadProfitPct: number;
  dasarHukum: string;
  keterangan?: string | null;
  components?: AHSPComponent[];
  calculatedPrice?: number;
}

export interface AHSPComponent extends BaseEntity {
  templateId: string;
  resourceId?: string | null;
  jenis: AHSPComponentType;
  kodeSumberDaya: string;
  uraian: string;
  satuan: string;
  koefisien: number;
  hargaDasar?: number;
  subtotal?: number;
}

export interface AHSPComponentDetail {
  id: string;
  jenis: AHSPComponentType;
  kode: string;
  uraian: string;
  satuan: string;
  koefisien: number;
  hargaDasar: number;
  subtotal: number;
  hasPrice: boolean;
  resourceId?: string | null;
}

export interface AHSPUnitPriceCalculation {
  templateId: string;
  kode: string;
  nama: string;
  satuan: string;
  kategori: string;
  overheadProfitPct: number;
  biayaTenaga: number;
  biayaBahan: number;
  biayaAlat: number;
  biayaSubkon: number;
  biayaLangsung: number;
  overheadAmount: number;
  totalHargaSatuan: number;
  components: AHSPComponentDetail[];
}

export type DivisionCategory =
  | 'Pekerjaan Persiapan'
  | 'Pekerjaan Struktur'
  | 'Pekerjaan Arsitektur'
  | 'Pekerjaan MEP'
  | 'Manajemen & Overhead';

export interface BOQItem extends BaseEntity {
  projectId: string;
  parentId?: string | null;
  ahspId?: string | null;
  divisionCategory: DivisionCategory;
  kode: string;
  uraian: string;
  satuan: string;
  volume: number;
  hargaSatuan: number;
  jumlahHarga: number;
  bobotPersen: number;
  progresPersen: number;
  urutan: number;
}

export interface BOQDivisionSummary {
  kategori: DivisionCategory;
  itemCount: number;
  total: number;
  bobotPersen: number;
}

export interface BOQSummary {
  projectId: string;
  projectCode: string;
  projectName: string;
  totalItems: number;
  subtotal: number;
  ppnPercent: number;
  ppnNominal: number;
  grandTotal: number;
  terbilang: string;
  terbilangSubtotal: string;
  progressActual: number;
  divisions: BOQDivisionSummary[];
}

// ─── Phase F: Payment Terms ──────────────────────────────────

export type PaymentTermJenis = 'UangMuka' | 'Termin' | 'Retensi';
export type PaymentTermStatus = 'Draft' | 'Tagih' | 'Lunas';

export interface PaymentTerm extends BaseEntity {
  projectId: string;
  jenis: PaymentTermJenis;
  urutan: number;
  label: string;
  persen: number;        // 0–100
  nominal: number;       // Bigint Rupiah (server-calculated)
  milestoneId?: string | null;
  milestoneTitle?: string | null;
  masaPemeliharaanHari?: number | null; // Retensi only
  status: PaymentTermStatus;
  tanggalTagih?: string | null; // ISO date
  tanggalLunas?: string | null; // ISO date
  keterangan?: string | null;
}

export interface PaymentScheduleSummary {
  totalPersen: number;
  totalNominal: number;
  totalTagih: number;
  totalLunas: number;
  countDraft: number;
  countTagih: number;
  countLunas: number;
}

export interface PaymentSchedule {
  terms: PaymentTerm[];
  summary: PaymentScheduleSummary;
}
