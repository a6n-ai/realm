"use client";

import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@foundry/design-system";

/** Destructive-action confirm in the house dialog, in place of the browser's window.confirm. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      }
    >
      {null}
    </ResponsiveDialog>
  );
}
