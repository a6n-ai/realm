"use client";

import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      contentClassName="sm:max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={danger ? "destructive" : "default"}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex items-center gap-3 px-4 py-2">
        <span
          className={
            danger
              ? "bg-destructive/10 text-destructive flex size-10 shrink-0 items-center justify-center rounded-full"
              : "bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full"
          }
        >
          <TriangleAlertIcon className="size-5" />
        </span>
      </div>
    </ResponsiveDialog>
  );
}
