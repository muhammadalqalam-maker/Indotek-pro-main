/**
 * OnboardingWizard
 * Ditampilkan saat user sudah login tapi belum punya workspace membership.
 * Memanggil RPC create_workspace (security definer) lalu reload sesi.
 */
import React, { useState } from 'react';
import { HardHat, Building2, Globe, FileText, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface WizardState {
  companyName: string;
  slug: string;
  address: string;
  npwp: string;
}

interface OnboardingWizardProps {
  userEmail: string;
  onComplete: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-|-$/g, '');
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ userEmail, onComplete }) => {
  const [step, setStep] = useState<'form' | 'submitting' | 'success' | 'error'>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [form, setForm] = useState<WizardState>({
    companyName: '',
    slug: '',
    address: '',
    npwp: '',
  });

  const handleNameChange = (name: string) => {
    setForm(prev => ({
      ...prev,
      companyName: name,
      slug: prev.slug || slugify(name),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim() || !form.slug.trim()) return;

    setStep('submitting');
    setErrorMsg('');

    const { data, error } = await supabase.rpc('create_workspace', {
      p_name: form.companyName.trim(),
      p_slug: form.slug.trim(),
      p_address: form.address.trim(),
      p_npwp: form.npwp.trim(),
    });

    if (error) {
      setErrorMsg(error.message);
      setStep('error');
      return;
    }

    if (data?.success) {
      setStep('success');
      setTimeout(() => onComplete(), 1500);
    } else {
      setErrorMsg(data?.message || 'Gagal membuat workspace.');
      setStep('error');
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7F6]">
        <div className="text-center space-y-4 animate-in fade-in duration-500">
          <div className="w-16 h-16 rounded-2xl bg-[#12352B] flex items-center justify-center mx-auto shadow-lg">
            <CheckCircle className="w-8 h-8 text-[#D6A85C]" />
          </div>
          <h2 className="text-xl font-bold text-[#202B26]">Workspace berhasil dibuat!</h2>
          <p className="text-sm text-[#69766F]">Memuat dashboard Anda...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0D2318] via-[#12352B] to-[#1A4A38] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#D6A85C] flex items-center justify-center mx-auto mb-4 shadow-xl">
            <HardHat className="w-7 h-7 text-[#12352B]" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Selamat Datang di Indotek Pro</h1>
          <p className="text-[#A2B8AE] text-sm mt-1">Daftarkan perusahaan Anda untuk mulai mengelola proyek konstruksi.</p>
          <p className="text-[#6B8F82] text-xs mt-1">Login sebagai: {userEmail}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-[#E2E8E4]">
            <div className="w-8 h-8 rounded-lg bg-[#EEF4F0] flex items-center justify-center">
              <Building2 className="w-4 h-4 text-[#12352B]" />
            </div>
            <div>
              <h2 className="font-semibold text-[#202B26] text-sm">Buat Profil Perusahaan</h2>
              <p className="text-xs text-[#69766F]">Informasi ini akan tampil di semua dokumen dan ekspor.</p>
            </div>
          </div>

          {step === 'error' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{errorMsg}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nama Perusahaan */}
            <div>
              <label className="block text-xs font-semibold text-[#202B26] mb-1.5">
                Nama Perusahaan <span className="text-red-500">*</span>
              </label>
              <input
                id="onboarding-company-name"
                type="text"
                required
                placeholder="PT Contoh Konstruksi Nusantara"
                value={form.companyName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-[#D5E1DA] text-sm focus:outline-none focus:ring-2 focus:ring-[#12352B] focus:border-transparent bg-white"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block text-xs font-semibold text-[#202B26] mb-1.5">
                ID Workspace (Slug) <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1">
                <Globe className="w-4 h-4 text-[#69766F] shrink-0" />
                <input
                  id="onboarding-slug"
                  type="text"
                  required
                  placeholder="contoh-konstruksi"
                  pattern="^[a-z0-9][a-z0-9-]{1,62}$"
                  title="Huruf kecil, angka, dan tanda hubung. Minimal 2 karakter."
                  value={form.slug}
                  onChange={(e) => setForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-[#D5E1DA] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#12352B]"
                />
              </div>
              <p className="text-xs text-[#69766F] mt-1">Hanya huruf kecil, angka, dan tanda hubung (-). Tidak dapat diubah setelah dibuat.</p>
            </div>

            {/* Alamat */}
            <div>
              <label className="block text-xs font-semibold text-[#202B26] mb-1.5">
                Alamat Perusahaan
              </label>
              <textarea
                id="onboarding-address"
                rows={2}
                placeholder="Jl. Contoh No. 1, Jakarta Selatan 12345"
                value={form.address}
                onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-[#D5E1DA] text-sm focus:outline-none focus:ring-2 focus:ring-[#12352B] resize-none"
              />
            </div>

            {/* NPWP */}
            <div>
              <label className="block text-xs font-semibold text-[#202B26] mb-1.5">
                <FileText className="w-3 h-3 inline mr-1" />
                NPWP Perusahaan
              </label>
              <input
                id="onboarding-npwp"
                type="text"
                placeholder="00.000.000.0-000.000"
                value={form.npwp}
                onChange={(e) => setForm(prev => ({ ...prev, npwp: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-[#D5E1DA] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#12352B]"
              />
            </div>

            {/* Submit */}
            <button
              id="onboarding-submit"
              type="submit"
              disabled={step === 'submitting' || !form.companyName.trim() || !form.slug.trim()}
              className="w-full py-3 rounded-xl bg-[#12352B] hover:bg-[#0D2318] text-white font-semibold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {step === 'submitting' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Membuat workspace...
                </>
              ) : (
                'Buat Perusahaan & Mulai'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[#6B8F82] text-xs mt-6">
          Anda akan didaftarkan sebagai <strong className="text-[#A2B8AE]">Owner</strong> workspace ini.
          Anda dapat mengundang anggota tim setelah masuk.
        </p>
      </div>
    </div>
  );
};
