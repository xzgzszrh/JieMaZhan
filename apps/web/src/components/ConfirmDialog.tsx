type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="confirm-panel">
        <h3 className="confirm-title">{title}</h3>
        {description ? <p className="confirm-description">{description}</p> : null}
        <div className="confirm-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button type="button" className={`btn ${danger ? "danger" : ""}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

