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
           success: <CheckCircle2 className="w-4 h-4 text-success shrink-0" />,
           warning: <AlertTriangle className="w-4 h-4 text-warning shrink-0" />,
           danger: <AlertCircle className="w-4 h-4 text-danger shrink-0" />,
           info: <Info className="w-4 h-4 text-info shrink-0" />,
         };

         const bgStyles = {
           success: 'bg-success-light border-success-light/60 text-success',
           warning: 'bg-warning-light border-warning-light/60 text-warning',
           danger: 'bg-danger-light border-danger-light/60 text-danger',
           info: 'bg-info-light border-info-light/60 text-info',
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
                 <div className="text-xs font-semibold text-text-primary mb-0.5">{toast.title}</div>
               )}
               <div className="text-xs text-text-primary/90 leading-snug">{toast.message}</div>
            </div>
            <button
               onClick={() => removeToast(toast.id)}
               className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors -mr-1"
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
