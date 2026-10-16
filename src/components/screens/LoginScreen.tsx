import React, { useState, useEffect } from 'react';
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
import { useUI } from '../../context/UIContext';
import { Button } from '../common/Button';

export const LoginScreen: React.FC = () => {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, sendPasswordReset, updatePassword, isPasswordRecovery, setIsPasswordRecovery } = useAuth();
  const { addToast } = useUI();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Password Reset Modal
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password Update Modal (for recovery flow)
  const [isUpdatePasswordModalOpen, setIsUpdatePasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [updatePasswordSubmitting, setUpdatePasswordSubmitting] = useState(false);
  const [updatePasswordFeedback, setUpdatePasswordFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Detect PASSWORD_RECOVERY event
  useEffect(() => {
    if (isPasswordRecovery) {
      setIsUpdatePasswordModalOpen(true);
    }
  }, [isPasswordRecovery]);

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

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

    if (isSignUp && !fullName.trim()) {
      setErrorMsg('Harap masukkan nama lengkap.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignUp) {
        const needsConfirmation = await signUpWithEmail(email, password, fullName);
        setErrorMsg(null);
        addToast({ type: 'success', title: 'Pendaftaran berhasil', message: needsConfirmation ? 'Periksa email untuk verifikasi sebelum masuk.' : 'Akun siap digunakan.' });
        setIsSignUp(false);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: any) {
      const message = err?.message?.toLowerCase();
      if (message?.includes('invalid') && message?.includes('credential')) {
        setErrorMsg('Email atau kata sandi tidak sesuai. Periksa kembali data akun Anda.');
      } else if (message?.includes('too many requests')) {
        setErrorMsg('Terlalu banyak percobaan gagal. Silakan tunggu beberapa saat atau atur ulang kata sandi.');
      } else if (message?.includes('network') || message?.includes('failed')) {
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

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatePasswordFeedback(null);

    if (!newPassword) {
      setUpdatePasswordFeedback({ type: 'error', text: 'Harap masukkan kata sandi baru.' });
      return;
    }

    if (newPassword.length < 12) {
      setUpdatePasswordFeedback({
        type: 'error',
        text: 'Kata sandi baru minimal 12 karakter untuk memenuhi standar keamanan enterprise.',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setUpdatePasswordFeedback({
        type: 'error',
        text: 'Konfirmasi kata sandi tidak cocok. Harap periksa kembali.',
      });
      return;
    }

    setUpdatePasswordSubmitting(true);
    try {
      await updatePassword(newPassword);
      setUpdatePasswordFeedback({
        type: 'success',
        text: 'Kata sandi berhasil diperbarui. Anda dapat melanjutkan menggunakan akun Anda.',
      });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setUpdatePasswordFeedback({
        type: 'error',
        text: err?.message || 'Gagal memperbarui kata sandi. Silakan coba lagi.',
      });
    } finally {
      setUpdatePasswordSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-bg-subtle flex flex-col justify-between selection:bg-primary/15 selection:text-primary">
      {/* Top Brand Bar */}
      <header className="w-full px-6 py-5 max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-xs">
            <HardHat className="w-5 h-5 text-accent-gold" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-wider text-primary">INDOTEK</span>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-accent-gold text-primary tracking-wider uppercase">
                PRO
              </span>
            </div>
            <p className="text-xs font-medium text-text-muted -mt-0.5">Construction Management Platform</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-text-muted bg-white px-3 py-1.5 rounded-lg border border-border-subtle shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-success" />
          <span>Sistem Keamanan Enterprise Terverifikasi</span>
        </div>
      </header>

      {/* Main Form Centered Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md bg-white rounded-2xl border border-border-subtle shadow-sm p-6 sm:p-8">
          {/* Header Typography */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-border-muted flex items-center justify-center mx-auto mb-3 shadow-2xs">
              <HardHat className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
              {isSignUp ? 'Buat Akun Baru' : 'Masuk ke Akun'}
            </h1>
            <p className="text-xs text-text-muted mt-1 max-w-xs mx-auto leading-relaxed">
              Akses portal monitoring proyek, kendali RAB, logistik material, dan persetujuan pengadaan.
            </p>
          </div>

          {/* Error / Alert Message */}
          {errorMsg && (
            <div className="p-3 mb-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">Nama Lengkap <span className="text-danger">*</span></label>
                <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nama lengkap" className="w-full h-11 px-3.5 bg-white border border-border-muted rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
              Alamat Email <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@indotekpro.id"
                  className="w-full h-11 pl-3.5 pr-10 bg-white border border-border-muted rounded-xl text-xs text-text-primary placeholder-text-muted/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                />
                <Mail className="w-4 h-4 text-text-muted/70 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-text-primary">
                  Kata Sandi <span className="text-danger">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setResetFeedback(null);
                    setIsResetModalOpen(true);
                  }}
                  className="text-xs font-semibold text-success hover:text-primary hover:underline cursor-pointer"
                >
                  Lupa kata sandi?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 12 karakter (Enterprise Standard)"
                  className="w-full h-11 pl-3.5 pr-10 bg-white border border-border-muted rounded-xl text-xs text-text-primary placeholder-text-muted/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted/70 hover:text-text-primary transition-colors cursor-pointer"
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
              {isSubmitting ? 'Memverifikasi...' : 'Masuk ke Portal Proyek'}
            </Button>
          </form>

          <button type="button" onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(null); }} className="w-full mt-4 text-xs font-semibold text-primary hover:underline">
            {isSignUp ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar dengan email'}
          </button>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-subtle" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider text-text-muted">
              <span className="bg-white px-2">atau</span>
            </div>
          </div>

          {/* Google Workspace SSO */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            className="w-full h-11 px-4 rounded-xl border border-border-muted bg-white hover:bg-bg-subtle text-text-primary font-semibold text-xs flex items-center justify-center gap-3 transition-colors shadow-2xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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
      <footer className="w-full px-6 py-4 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-text-muted border-t border-border-subtle/60">
        <div>
          <span>© 2026 PT Indotek Bangun Nusantara · Enterprise Construction Management SaaS</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hover:text-primary">Kebijakan Privasi</span>
          <span>·</span>
          <span className="hover:text-primary">Syarat Penggunaan</span>
          <span>·</span>
          <span>Versi Produksi 2.4</span>
        </div>
      </footer>

      {/* Password Recovery Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-text-primary/40 backdrop-blur-[2px]"
            onClick={() => setIsResetModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-2xl border border-border-subtle shadow-2xl p-6 z-10">
            <button
              onClick={() => setIsResetModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-subtle"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-bold text-text-primary mb-1">
              Atur Ulang Kata Sandi
            </h3>
            <p className="text-xs text-text-muted mb-4">
              Masukkan email perusahaan Anda. Kami akan mengirimkan tautan untuk membuat kata sandi baru.
            </p>

            {resetFeedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2.5 mb-4 ${
                  resetFeedback.type === 'success'
                    ? 'bg-success/10 text-success border border-success/30'
                    : 'bg-danger/10 text-danger border border-danger/30'
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
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Email Akun
                </label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="nama@indotekpro.id"
                  className="w-full h-10 px-3.5 bg-white border border-border-muted rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary"
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

      {/* Password Update Modal (Recovery Flow) */}
      {isUpdatePasswordModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-border-subtle">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-success/10 rounded-lg">
                  <ShieldCheck className="w-5 h-5 text-success" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary">Perbarui Kata Sandi</h3>
              </div>
              <button
                onClick={() => {
                  setIsUpdatePasswordModalOpen(false);
                  setIsPasswordRecovery(false);
                  setUpdatePasswordFeedback(null);
                }}
                className="p-1 hover:bg-bg-subtle rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-text-muted" />
              </button>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              {updatePasswordFeedback && (
                <div
                  role={updatePasswordFeedback.type === 'error' ? 'alert' : 'status'}
                  className={`p-3 rounded-xl text-xs ${
                    updatePasswordFeedback.type === 'success'
                      ? 'bg-success/10 text-success border border-success/30'
                      : 'bg-danger/10 text-danger border border-danger/30'
                  }`}
                >
                  {updatePasswordFeedback.text}
                </div>
              )}
              {/* New Password Field */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Kata Sandi Baru</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 12 karakter"
                    className="w-full px-4 py-2 rounded-lg border border-border-subtle bg-white text-text-primary placeholder-text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Konfirmasi Kata Sandi</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Masukkan kembali kata sandi"
                    className="w-full px-4 py-2 rounded-lg border border-border-subtle bg-white text-text-primary placeholder-text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsUpdatePasswordModalOpen(false);
                    setIsPasswordRecovery(false);
                    setUpdatePasswordFeedback(null);
                  }}
                  disabled={updatePasswordSubmitting}
                >
                  {updatePasswordFeedback?.type === 'success' ? 'Selesai' : 'Batal'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={updatePasswordSubmitting || updatePasswordFeedback?.type === 'success'}
                >
                  {updatePasswordSubmitting
                    ? 'Memperbarui...'
                    : updatePasswordFeedback?.type === 'success'
                      ? 'Kata Sandi Diperbarui'
                      : 'Perbarui Kata Sandi'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
