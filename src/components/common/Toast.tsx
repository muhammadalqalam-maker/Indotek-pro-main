import React from 'react';
import { CheckCircle2, AlertTriangle, Info, AlertCircle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const icons = {
          success: <CheckCircle2 className="w-4 h-4 text-[#1C6843] shrink-0" />,
          warning: <AlertTriangle className="w-4 h-4 text-[#9E6B05] shrink-0" />,
          danger: <AlertCircle className="w-4 h-4 text-[#A82A20] shrink-0" />,
          info: <Info className="w-4 h-4 text-[#235D9F] shrink-0" />,
        };

        const bgStyles = {
          success: 'bg-[#E5F4EB] border-[#CDE9D7] text-[#1C6843]',
          warning: 'bg-[#FFF3D8] border-[#FCE6B1] text-[#9E6B05]',
          danger: 'bg-[#FCE9E7] border-[#F8CBC7] text-[#A82A20]',
          info: 'bg-[#E8F0FA] border-[#CEE0F5] text-[#235D9F]',
        };

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border shadow-md transition-all animate-in slide-in-from-bottom-2 bg-white ${
              bgStyles[toast.type]
            }`}
          >
            {icons[toast.type]}
            <div className="flex-1 min-w-0">
              {toast.title && (
                <div className="text-xs font-semibold text-[#202B26] mb-0.5">{toast.title}</div>
              )}
              <div className="text-xs text-[#202B26]/90 leading-snug">{toast.message}</div>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[#69766F] hover:text-[#202B26] p-0.5 rounded transition-colors -mr-1"
              aria-label="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
