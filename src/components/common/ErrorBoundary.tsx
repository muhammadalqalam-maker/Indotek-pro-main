import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  screenName?: string;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] Terjadi kesalahan pada ${this.props.screenName || 'komponen'}:`, error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-6 sm:p-10 text-center bg-[#FAFBFB] rounded-xl border border-dashed border-[#CBD5CF] m-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-4 border border-amber-200">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <h3 className="text-base font-semibold text-[#202B26] mb-1">
            Gagal Memuat {this.props.screenName || 'Modul Layar'}
          </h3>
          <p className="text-xs text-[#4F5D56] max-w-md mb-4 leading-relaxed">
            Terjadi anomali saat merender tampilan ini. Layar lainnya tetap berfungsi normal.
          </p>

          {this.state.error?.message && (
            <div className="max-w-lg mb-5 p-3 rounded-lg bg-white border border-[#E2E8E4] text-[11px] font-mono text-[#69766F] text-left overflow-x-auto">
              {this.state.error.message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={this.handleReset}
            >
              Coba Lagi
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Muat Ulang Halaman
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
