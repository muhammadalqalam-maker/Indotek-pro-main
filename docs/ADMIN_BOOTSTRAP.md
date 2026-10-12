# Panduan Operasional Bootstrap Owner & Administrator — Indotek Pro

## Ikhtisar Keamanan

Dalam arsitektur produksi Indotek Pro, **klien tidak memiliki wewenang untuk menetapkan peran (*role*) atau membuat akun administrator**. Pendaftaran mandiri melalui antarmuka web selalu menghasilkan status **`Menunggu Undangan`** tanpa hak akses data operasional maupun finansial.

Pengesahan akun Owner / Direktur Utama pertama harus dilakukan secara *out-of-band* melalui server menggunakan Firebase Admin SDK.

---

## Prasyarat
1. Lingkungan Node.js dengan `tsx` terinstal.
2. Variabel kredensial lingkungan Google Cloud / Firebase terkonfigurasi.

---

## Menjalankan Skrip Bootstrap Sekali Pakai

Jalankan perintah berikut melalui terminal server:

```bash
npx tsx scripts/bootstrap-owner.ts <email> <password> <nama_lengkap>
```

### Contoh Penggunaan:
```bash
npx tsx scripts/bootstrap-owner.ts direktur@indotekpro.id "Katasandi#Aman2026" "Ir. Bambang Sujarwo, IPU"
```

### Apa yang Dilakukan Skrip Ini:
1. **Validasi Kompleksitas Sandi:** Memastikan panjang kata sandi minimal 12 karakter.
2. **Firebase Auth User Creation:** Mendaftarkan akun di Firebase Authentication dan menandai `emailVerified: true`.
3. **Custom Claims Injection:** Menetapkan klaim token `{ role: 'Owner / Director', workspaceId: 'indotek-jkt', admin: true, status: 'Aktif' }` yang diverifikasi secara matematis oleh `firestore.rules`.
4. **Firestore Record Ingestion:** Menulis dokumen profil `/users/{uid}` dengan status `Aktif` dan dokumen keanggotaan `/workspaces/indotek-jkt/members/{uid}`.

---

## Verifikasi Pasca-Bootstrap
Setelah skrip selesai, masuk ke aplikasi melalui portal login web menggunakan email dan sandi yang telah didaftarkan. Akun tersebut akan langsung memiliki wewenang Owner / Director penuh untuk mengundang personil lain.
