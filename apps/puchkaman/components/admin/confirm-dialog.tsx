"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { TriangleAlertIcon } from "lucide-react";

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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{ position: "fixed", inset: 0, background: "rgba(22,20,13,.55)", zIndex: 70, display: "grid", placeItems: "center", padding: 20 }}
        >
          <Dialog.Content
            className="card"
            style={{ width: "100%", maxWidth: 400, padding: 26, background: "var(--white)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex center" style={{ gap: 12, marginBottom: 14 }}>
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: danger ? "var(--red)" : "var(--yellow)",
                  border: "2.5px solid var(--ink)",
                  display: "grid",
                  placeItems: "center",
                  color: danger ? "#fff" : "var(--ink)",
                  flexShrink: 0,
                }}
              >
                <TriangleAlertIcon size={20} />
              </span>
              <Dialog.Title className="display" style={{ fontSize: "1.15rem" }}>
                {title}
              </Dialog.Title>
            </div>
            <Dialog.Description style={{ fontWeight: 500, opacity: 0.85, marginBottom: 22 }}>{description}</Dialog.Description>
            <div className="flex" style={{ gap: 10, justifyContent: "flex-end" }}>
              <Dialog.Close asChild>
                <button type="button" className="btn btn--white btn--sm">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                className={`btn btn--sm ${danger ? "btn--red" : "btn--ink"}`}
                onClick={handleConfirm}
                disabled={busy}
                style={busy ? { opacity: 0.7, pointerEvents: "none" } : undefined}
              >
                {busy ? "Working…" : confirmLabel}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
