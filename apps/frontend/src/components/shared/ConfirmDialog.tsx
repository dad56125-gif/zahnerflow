import React from 'react';
import { ModalLayer } from './OverlayLayer';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmText: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}

const variantClassName = {
  danger: 'btn--danger',
  warning: 'btn--warning',
  primary: 'btn--primary',
};

const variantIcon = {
  danger: '!',
  warning: '!',
  primary: 'i',
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText,
  cancelText = '取消',
  variant = 'danger',
  onConfirm,
  onOpenChange,
}) => {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <ModalLayer
      open={open}
      onOpenChange={onOpenChange}
      id="confirm-dialog-overlay"
      closeOnBackdrop
      closeOnEscape
    >
      {({ close }) => (
        <div className="create-user__dialog overlay-base">
          <div className="dialog__content">
            <div className="delete-confirm__icon">{variantIcon[variant]}</div>
            <h3>{title}</h3>
            <div className="delete-confirm__text">
              {message}
            </div>
            <div className="dialog__buttons">
              <button className="btn btn--sm btn--secondary" onClick={close}>
                {cancelText}
              </button>
              <button className={`btn btn--sm ${variantClassName[variant]}`} onClick={handleConfirm}>
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalLayer>
  );
};
