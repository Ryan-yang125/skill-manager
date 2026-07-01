import type { ReactElement, ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmClassName?: string;
  onConfirm: () => void;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmClassName = "min-h-[31px] rounded-[5px] border-0 bg-[var(--button-bg)] px-[11px] text-xs font-[650] text-[var(--button-ink)] hover:opacity-85",
  onConfirm
}: ConfirmDialogProps): ReactElement {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="w-[min(420px,calc(100vw-48px))] rounded-lg border border-[var(--ink-faint)] bg-[var(--bg)] p-[18px] text-[var(--ink)] shadow-[var(--shadow)]">
        <AlertDialogHeader className="grid gap-2 text-left">
          <AlertDialogTitle className="m-0 text-lg font-bold text-[var(--ink)]">{title}</AlertDialogTitle>
          <AlertDialogDescription className="m-0 text-[13px] leading-[1.55] text-[var(--ink-body)]">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-[18px] flex flex-row justify-end gap-2 border-0 bg-transparent p-0">
          <AlertDialogCancel className="min-h-[31px] rounded-[5px] border-0 bg-[var(--hover-strong)] px-[11px] text-xs font-[650] text-[var(--ink)] hover:opacity-85">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction className={confirmClassName} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
