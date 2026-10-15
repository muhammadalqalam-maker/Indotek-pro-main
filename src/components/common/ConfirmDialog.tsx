import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  variant = 'info',
  children,
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const variantConfig = {
    danger: {
      icon: <AlertCircle className="w-12 h-12 text-danger" />,
      confirmButtonVariant: 'danger' as const,
      iconBg: 'bg-danger-light',
    },
    warning: {
      icon: <AlertTriangle className="w-12 h-12 text-warning" />,
      confirmButtonVariant: 'primary' as const,
      iconBg: 'bg-warning-light',
    },
    info: {
      icon: <Info className="w-12 h-12 text-info" />,
      confirmButtonVariant: 'primary' as const,
      iconBg: 'bg-info-light',
    },
    success: {
      icon: <CheckCircle2 className="w-12 h-12 text-success" />,
      confirmButtonVariant: 'primary' as const,
      iconBg: 'bg-success-light',
    },
  };

  const config = variantConfig[variant];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      maxWidth="sm"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            {cancelText}
          </Button>
          <Button
            variant={config.confirmButtonVariant}
            size="sm"
            onClick={handleConfirm}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center text-center space-y-4">
        <div className={`${config.iconBg} rounded-full p-4`}>
          {config.icon}
        </div>
        {children && (
          <div className="text-sm text-text-primary leading-relaxed">
            {children}
          </div>
        )}
      </div>
    </Modal>
  );
};
