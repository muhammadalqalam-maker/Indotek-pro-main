import React, { useState } from 'react';
import {
  HardHat,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Building2,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';

export const LoginScreen: React.FC = () => {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, sendPasswordReset } = useAuth();

  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Password Reset Modal
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim()) {
      setErrorMsg('Harap masukkan alamat email perusahaan Anda.');
      return;
    }

    if (!validateEmail(email)) {
      setErrorMsg('Format email tidak valid. Gunakan format nama@perusahaan.co.id.');
      return;
    }

    if (!password) {
      setErrorMsg('Harap masukkan kata sandi akun.');
      return;
    }

    if (password.length < 12) {
      setErrorMsg('Kata sandi minimal 12 karakter untuk memenuhi standar keamanan enterprise.');
      return;
    }

    if (mode === 'register' && !name.trim()) {
      setErrorMsg('Harap masukkan nama lengkap Anda.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, name.trim());
        setSuccessMsg('Pendaftaran berhasil! Tautan verifikasi telah dikirim ke email Anda. Akun baru berstatus "Menunggu Undangan" dari Administrator.');
      }
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setErrorMsg('Email atau kata sandi tidak sesuai. Periksa kembali data akun Anda.');
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg('Email ini sudah terdaftar. Silakan pilih tab Masuk ke Akun.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('Terlalu banyak percobaan gagal. Silakan tunggu beberapa saat atau atur ulang kata sandi.');
      } else if (code === 'auth/network-request-failed') {
        setErrorMsg('Gagal terhubung ke server autentikasi. Periksa koneksi internet Anda.');
      } else {
        setErrorMsg(err?.message || 'Gagal memproses autentikasi. Silakan coba lagi.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      const msg = err?.message || err?.msg || '';
      if (msg.includes('not enabled') || err?.error_code === 'validation_failed') {
        setErrorMsg('Login Google belum diaktifkan di Supabase Dashboard (Authentication > Providers > Google). Silakan gunakan formulir Email & Kata Sandi di bawah.');
      } else if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorMsg('Gagal masuk dengan Google Workspace. Silakan gunakan email dan sandi.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetFeedback(null);

    if (!resetEmail.trim() || !validateEmail(resetEmail)) {
      setResetFeedback({
        type: 'error',
        text: 'Masukkan alamat email yang valid untuk pengiriman tautan pemulihan.',
      });
      return;
    }

    setResetSubmitting(true);
    try {
      await sendPasswordReset(resetEmail);
      setResetFeedback({
        type: 'success',
        text: `Tautan instruksi pemulihan kata sandi telah dikirim ke ${resetEmail}. Silakan periksa kotak masuk atau spam Anda.`,
      });
    } catch (err: any) {
      setResetFeedback({
        type: 'error',
        text: 'Gagal mengirim email pemulihan. Pastikan alamat email telah terdaftar.',
      });
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F5F7F6] flex flex-col justify-between selection:bg-[#12352B]/15 selection:text-[#12352B]">
      {/* Top Brand Bar */}
      <header className="w-full px-6 py-5 max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#12352B] flex items-center justify-center shadow-xs">
            <HardHat className="w-5 h-5 text-[#D6A85C]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-wider text-[#12352B]">INDOTEK</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#D6A85C] text-[#12352B] tracking-wider uppercase">
                PRO
              </span>
            </div>
            <p className="text-[10px] font-medium text-[#69766F] -mt-0.5">Construction Management Platform</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-[#69766F] bg-white px-3 py-1.5 rounded-lg border border-[#E2E8E4] shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-[#1C6843]" />
          <span>Sistem Keamanan Enterprise Terverifikasi</span>
        </div>
      </header>

      {/* Main Form Centered Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md bg-white rounded-2xl border border-[#E2E8E4] shadow-sm p-6 sm:p-8">
          {/* Header Typography */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-[#EAEFEA] border border-[#CBD5CF] flex items-center justify-center mx-auto mb-3 shadow-2xs">
              <HardHat className="w-6 h-6 text-[#12352B]" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26]">
              {mode === 'signin' ? 'Masuk ke Akun' : 'Daftar Akun Operasional'}
            </h1>
            <p className="text-xs text-[#69766F] mt-1 max-w-xs mx-auto leading-relaxed">
              {mode === 'signin'
                ? 'Akses portal monitoring proyek, kendali RAB, logistik material, dan persetujuan pengadaan.'
                : 'Daftarkan identitas resmi karyawan untuk otorisasi wewenang dan lembar kerja proyek.'}
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-[#F1F4F2] rounded-xl mb-6 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-white text-[#12352B] shadow-2xs'
                  : 'text-[#69766F] hover:text-[#202B26]'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-[#12352B] shadow-2xs'
                  : 'text-[#69766F] hover:text-[#202B26]'
              }`}
            >
              Daftar Karyawan
            </button>
          </div>

          {/* Error / Alert Message */}
          {errorMsg && (
            <div className="p-3 mb-4 rounded-xl bg-[#FCE9E7] border border-[#F8CBC7] text-[#A82A20] text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-[#202B26] mb-1">
                  Nama Lengkap & Gelar <span className="text-[#A82A20]">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Ir. Budi Santoso, S.T."
                    className="w-full h-11 px-3.5 bg-white border border-[#CBD5CF] rounded-xl text-xs text-[#202B26] placeholder-[#A2B8AE] focus:outline-none focus:border-[#12352B] focus:ring-1 focus:ring-[#12352B] transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#202B26] mb-1">
                Alamat Email Perusahaan <span className="text-[#A82A20]">*</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@indotekpro.id"
                  className="w-full h-11 pl-3.5 pr-10 bg-white border border-[#CBD5CF] rounded-xl text-xs text-[#202B26] placeholder-[#A2B8AE] focus:outline-none focus:border-[#12352B] focus:ring-1 focus:ring-[#12352B] transition-colors"
                />
                <Mail className="w-4 h-4 text-[#A2B8AE] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#202B26]">
                  Kata Sandi <span className="text-[#A82A20]">*</span>
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setResetFeedback(null);
                      setIsResetModalOpen(true);
                    }}
                    className="text-xs font-semibold text-[#285744] hover:text-[#12352B] hover:underline cursor-pointer"
                  >
                    Lupa kata sandi?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 12 karakter (Enterprise Standard)"
                  className="w-full h-11 pl-3.5 pr-10 bg-white border border-[#CBD5CF] rounded-xl text-xs text-[#202B26] placeholder-[#A2B8AE] focus:outline-none focus:border-[#12352B] focus:ring-1 focus:ring-[#12352B] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#A2B8AE] hover:text-[#202B26] transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full h-11 font-semibold text-xs tracking-wide shadow-xs mt-2"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? mode === 'signin'
                  ? 'Memverifikasi...'
                  : 'Mendaftarkan Akun...'
                : mode === 'signin'
                ? 'Masuk ke Portal Proyek'
                : 'Buat Akun Karyawan'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E2E8E4]" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase tracking-wider text-[#69766F]">
              <span className="bg-white px-2">atau</span>
            </div>
          </div>

          {/* Google Workspace SSO */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            className="w-full h-11 px-4 rounded-xl border border-[#CBD5CF] bg-white hover:bg-[#F5F7F6] text-[#202B26] font-semibold text-xs flex items-center justify-center gap-3 transition-colors shadow-2xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Masuk via Google Workspace</span>
          </button>
        </div>
      </main>

      {/* Subtle Enterprise Footer */}
      <footer className="w-full px-6 py-4 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#69766F] border-t border-[#E2E8E4]/60">
        <div>
          <span>© 2026 PT Indotek Bangun Nusantara · Enterprise Construction Management SaaS</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hover:text-[#12352B]">Kebijakan Privasi</span>
          <span>·</span>
          <span className="hover:text-[#12352B]">Syarat Penggunaan</span>
          <span>·</span>
          <span>Versi Produksi 2.4</span>
        </div>
      </footer>

      {/* Password Recovery Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#202B26]/40 backdrop-blur-[2px]"
            onClick={() => setIsResetModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-2xl border border-[#E2E8E4] shadow-2xl p-6 z-10">
            <button
              onClick={() => setIsResetModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-[#69766F] hover:text-[#202B26] hover:bg-[#F5F7F6]"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-bold text-[#202B26] mb-1">
              Atur Ulang Kata Sandi
            </h3>
            <p className="text-xs text-[#69766F] mb-4">
              Masukkan email perusahaan Anda. Kami akan mengirimkan tautan untuk membuat kata sandi baru.
            </p>

            {resetFeedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2.5 mb-4 ${
                  resetFeedback.type === 'success'
                    ? 'bg-[#E5F4EB] text-[#1C6843] border border-[#CDE9D7]'
                    : 'bg-[#FCE9E7] text-[#A82A20] border border-[#F8CBC7]'
                }`}
              >
                {resetFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{resetFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#202B26] mb-1">
                  Email Akun
                </label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="nama@indotekpro.id"
                  className="w-full h-10 px-3.5 bg-white border border-[#CBD5CF] rounded-xl text-xs text-[#202B26] focus:outline-none focus:border-[#12352B]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsResetModalOpen(false)}
                >
                  Tutup
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={resetSubmitting}
                >
                  {resetSubmitting ? 'Mengirim...' : 'Kirim Tautan Pemulihan'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
