import React, { useState } from 'react';
import { HardHat, LogIn, ShieldCheck, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { Button } from '../common/Button';

export const LoginModal: React.FC = () => {
  const {
    isLoginModalOpen,
    setIsLoginModalOpen,
    currentUser,
    userProfile,
    signInWithGoogle,
    signOutUser,
    isLoading
  } = useAuth();
  const { addToast } = useUI();

  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoginModalOpen) return null;

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
      setIsLoginModalOpen(false);
    } catch (err: any) {
      const message = err?.message || 'Gagal masuk. Silakan coba lagi.';
      setAuthError(message);
      addToast({ type: 'danger', title: 'Gagal Masuk', message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-primary/40 backdrop-blur-[2px] transition-opacity"
        onClick={() => setIsLoginModalOpen(false)}
      />

      {/* Modal Dialog */}
      <div
        className="relative w-full max-w-md bg-white rounded-2xl border border-border-subtle shadow-2xl overflow-hidden z-10 flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-primary p-6 text-white relative">
          <button
            onClick={() => setIsLoginModalOpen(false)}
            className="absolute top-4 right-4 p-1 rounded-lg text-text-muted/60 hover:text-white hover:bg-primary-light/80 transition-colors cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary-light border border-primary-light/70 flex items-center justify-center shadow-xs">
              <HardHat className="w-5 h-5 text-warning" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-wider text-white">INDOTEK</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-warning text-primary tracking-wider uppercase">
                  PRO
                </span>
              </div>
              <p className="text-xs text-text-muted/60">PT Indotek Bangun Nusantara</p>
            </div>
          </div>

          <h2 className="text-base font-bold text-white">
            {currentUser ? 'Akun Operasional Terhubung' : 'Masuk ke Portal Indotek Pro'}
          </h2>
          <p className="text-xs text-text-muted/70 mt-1 leading-relaxed">
            {currentUser
              ? 'Sesi Supabase Auth aktif dengan hak akses tingkat proyek.'
              : 'Autentikasi terpusat untuk monitoring proyek, approval RAB, dan pelaporan lapangan.'}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs">
          {authError && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}
          {currentUser ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-border-subtle bg-canvas space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-success">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Autentikasi Supabase Aktif</span>
                </div>
                <div className="pt-2 border-t border-border-subtle/60 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Nama:</span>
                    <span className="font-semibold text-text-primary">{userProfile?.name || currentUser.displayName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Email:</span>
                    <span className="font-mono text-text-primary truncate max-w-[200px]">{currentUser.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Peran:</span>
                    <span className="font-semibold text-primary">{userProfile?.role || 'Project Director'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">NIP:</span>
                    <span className="font-mono text-text-primary">{userProfile?.nip || 'IDK-2026-DIR'}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsLoginModalOpen(false)}
                >
                  Tutup
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    setAuthError(null);
                    try {
                      await signOutUser();
                      setIsLoginModalOpen(false);
                    } catch (error) {
                      const message = error instanceof Error ? error.message : String(error);
                      setAuthError(message);
                      addToast({
                        type: 'danger',
                        title: 'Gagal keluar akun',
                        message,
                      });
                    }
                  }}
                >
                  Keluar Akun
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-text-muted/80 leading-relaxed">
                Gunakan kredensial resmi Google Workspace perusahaan Anda untuk memverifikasi identitas dan hak akses RAB/PO.
              </p>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting || isLoading}
                className="w-full h-11 px-4 rounded-xl border border-border-subtle/80 bg-white hover:bg-canvas text-text-primary font-semibold text-xs flex items-center justify-center gap-3 transition-colors shadow-2xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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
                <span>{isSubmitting ? 'Menghubungkan...' : 'Lanjutkan dengan Google Workspace'}</span>
              </button>

              <div className="pt-2 text-xs text-text-muted text-center">
                <span>Dilindungi oleh Supabase Row Level Security & RBAC</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
