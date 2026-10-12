# Runbook & Panduan Rencana Rollback Migrasi Multi-Tenant Firestore

## 1. Ringkasan Arsitektur Baru
Model data Firestore Indotek Pro dimigrasikan dari koleksi datar (*flat root-level collections*) menjadi struktur hierarkis multi-tenant terisolasi penuh:

```
workspaces/{wsId}/
  ├── members/{uid}
  ├── projects/{pid}/
  │     ├── budget_lines/{lineId}
  │     ├── milestones/{milestoneId}
  │     ├── wbs_items/{wbsId}
  │     └── activities/{activityId}
  ├── materials/{materialId}
  ├── purchase_orders/{poId}
  ├── field_reports/{reportId}
  ├── stock_mutations/{mutationId}
  ├── stock_adjustments/{adjId}
  ├── budget_revisions/{revId}
  ├── petty_cash/{cashId}
  ├── audit_logs/{logId}
  ├── notifications/{notifId}
  └── counters/{counterId}
```

Global:
- `users/{uid}`: profil identitas global, `workspaceId`, `assignedProjectIds`.
- `admins/{uid}`: superadmin platform tingkat sistem.

---

## 2. Prosedur Eksekusi Migrasi (Idempoten)

Skrip migrasi `scripts/migrate-to-multitenant.ts` dirancang sepenuhnya idempoten (`schemaVersion >= 2` otomatis dilewati):

### Langkah A: Simulasi (Dry-Run)
Memeriksa integritas data dan menghitung jumlah dokumen tanpa menulis ke basis data:
```bash
npx tsx scripts/migrate-to-multitenant.ts --dry-run
```

### Langkah B: Penerapan Nyata (Apply)
Menerapkan migrasi bertahap secara batch (maksimal 400 mutasi per commit Firestore):
```bash
npx tsx scripts/migrate-to-multitenant.ts --apply --workspace-id indotek-enterprise
```

---

## 3. Rencana Rollback (Rollback Plan)

Jika ditemukan anomali atau kebutuhan kembali ke versi sebelumnya saat masa transisi:

1. **Prinsip Non-Destructive**:
   Skrip migrasi hanya membaca dari koleksi root lama (`projects`, `materials`, `purchase_orders`, dll.) dan menyalin data yang telah distandardisasi ke `workspaces/{wsId}/...`. Koleksi lama **TIDAK DIHAPUS** selama fase evaluasi staging (30 hari).
2. **Rollback Sisi Aplikasi**:
   Jika ingin mengembalikan klien sementara ke koleksi root:
   - Revert konfigurasi path di `src/services/firestoreService.ts` dan `src/server/workflowEngine.ts`.
   - Kembalikan `firestore.rules` ke versi cadangan `firestore.rules.old`.
3. **Rollback Sisi Data**:
   Untuk membersihkan subkoleksi baru jika migrasi dibatalkan:
   ```bash
   firebase firestore:delete "workspaces/indotek-enterprise" --recursive --force
   ```
4. **Verifikasi Integritas**:
   Jalankan `npm test` untuk memverifikasi bahwa 100% assertion state machine dan aturan RBAC terpenuhi.
