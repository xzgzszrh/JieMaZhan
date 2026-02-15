import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type DialogState = ConfirmOptions & { open: boolean };

const DEFAULT_STATE: DialogState = {
  open: false,
  title: "",
  description: "",
  confirmText: "确认",
  cancelText: "取消",
  danger: false
};

export const useConfirmDialog = () => {
  const [dialogState, setDialogState] = useState<DialogState>(DEFAULT_STATE);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const closeDialog = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setDialogState(DEFAULT_STATE);
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialogState({
        open: true,
        title: options.title,
        description: options.description ?? "",
        confirmText: options.confirmText ?? "确认",
        cancelText: options.cancelText ?? "取消",
        danger: options.danger ?? false
      });
    });
  }, []);

  const confirmDialogNode = (
    <ConfirmDialog
      open={dialogState.open}
      title={dialogState.title}
      description={dialogState.description}
      confirmText={dialogState.confirmText}
      cancelText={dialogState.cancelText}
      danger={dialogState.danger}
      onCancel={() => closeDialog(false)}
      onConfirm={() => closeDialog(true)}
    />
  );

  return { confirm, confirmDialogNode };
};

