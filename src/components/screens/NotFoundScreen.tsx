import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../common/Button';

export const NotFoundScreen: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <svg
            className="mx-auto h-24 w-24 text-[#12352B]/20"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        
        <h1 className="text-6xl font-bold text-[#12352B] mb-2">404</h1>
        <h2 className="text-xl font-semibold text-[#202B26] mb-3">Halaman Tidak Ditemukan</h2>
        <p className="text-sm text-[#69766F] mb-6">
          Halaman yang Anda cari tidak tersedia atau telah dipindahkan.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="primary"
            onClick={() => navigate('/')}
          >
            Kembali ke Dashboard
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate(-1)}
          >
            Halaman Sebelumnya
          </Button>
        </div>
      </div>
    </div>
  );
};
