import { ReactNode } from "react";

type InfoDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function InfoDialog({ open, title, onClose, children }: InfoDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="confirm-panel info-panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="confirm-title" style={{ margin: 0 }}>
            {title}
          </h3>
          <button type="button" className="btn secondary info-close-btn" onClick={onClose}>
            关闭
          </button>
        </div>
        <div style={{ marginTop: 10 }}>{children}</div>
      </div>
    </div>
  );
}

