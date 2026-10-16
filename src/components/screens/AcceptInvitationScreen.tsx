import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { Button } from '../common/Button';
import { supabase, unwrap } from '../../lib/supabase';

export const AcceptInvitationScreen: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useUI();

  const [token, setToken] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (token) {
      acceptInvitation();
    }
  }, [token]);

  const acceptInvitation = async () => {
    if (!token) return;

    setAccepting(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('accept_invitation', {
        p_token: token,
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      if (data?.status === 'success') {
        setSuccess(true);
        addToast({ type: 'success', message: 'Undangan berhasil diterima' });
        
        // Auto-login if user not logged in
        if (!data.logged_in && !data.user_id) {
          // Wait 2 seconds then redirect to login
          setTimeout(() => {
            navigate('/masuk');
          }, 2000);
        } else if (data.logged_in) {
          // If already logged in, redirect to dashboard
          setTimeout(() => {
            navigate('/');
          }, 2000);
        }
      } else if (data?.status === 'pending_approval') {
        // Account created but not yet activated by admin
        setIsPendingApproval(true);
        setSuccess(true);
        setError('Akun berhasil dibuat, menunggu persetujuan administrator.');
        addToast({ type: 'info', message: 'Menunggu persetujuan administrator' });
      } else if (data?.status === 'already_accepted') {
        setError('Undangan sudah diterima sebelumnya.');
        addToast({ type: 'warning', message: 'Undangan sudah diterima' });
        setTimeout(() => navigate('/masuk'), 2000);
      } else if (data?.status === 'expired') {
        setError('Undangan sudah kedaluwarsa (7 hari).');
        addToast({ type: 'danger', message: 'Undangan kedaluwarsa' });
        setTimeout(() => navigate('/masuk'), 2000);
      } else if (data?.status === 'not_found') {
        setError('Undangan tidak ditemukan.');
        addToast({ type: 'danger', message: 'Undangan tidak valid' });
        setTimeout(() => navigate('/masuk'), 2000);
      } else {
        throw new Error('Status respons tidak dikenali');
      }
    } catch (err: any) {
      const message = err?.message || 'Gagal menerima undangan';
      setError(message);
      addToast({ type: 'danger', message });
    } finally {
      setAccepting(false);
    }
  };

  if (!searchParams.has('token')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
        <div className="max-w-md w-full bg-surface rounded-2xl border border-border-subtle shadow-lg p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-warning-bg rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-warning" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">Undangan tidak valid</h2>
          <p className="text-text-secondary">Token undangan tidak ditemukan.</p>
          <Button onClick={() => navigate('/masuk')} className="w-full">
            Masuk
          </Button>
        </div>
      </div>
    );
  }

  if (!success && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
        <div className="max-w-md w-full bg-surface rounded-2xl border border-border-subtle shadow-lg p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-warning-bg rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-warning" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">Undangan tidak valid</h2>
          <p className="text-text-secondary">{error}</p>
          <Button onClick={() => navigate('/masuk')} className="w-full">
            Masuk
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
        <div className="max-w-md w-full bg-surface rounded-2xl border border-border-subtle shadow-lg p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-success-bg rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">Undangan Diterima!</h2>
          <p className="text-text-secondary">
            {isPendingApproval
              ? 'Akun Anda sedang menunggu persetujuan administrator. Anda akan menerima email notifikasi setelah akun diaktifkan.'
              : 'Undangan berhasil diterima. Anda akan diarahkan ke halaman masuk...'
            }
          </p>
          <div className="flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </div>
      </div>
    );
  }

  // Accepting state
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="max-w-md w-full bg-surface rounded-2xl border border-border-subtle shadow-lg p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
          <ShieldCheck className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-text-primary">Menerima Undangan...</h2>
        <p className="text-text-secondary">
          Silakan tunggu sebentar sementara kami memverifikasi undangan Anda.
        </p>
        <div className="flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    </div>
  );
};
