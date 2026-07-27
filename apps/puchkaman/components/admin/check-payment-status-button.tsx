"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { apiFetch } from "@/lib/http/api-fetch";

type CheckResult = {
  orderPublicId: string;
  orderStatus: string;
  paymentStatus: string | null;
  cloverStatus: string;
  changed: boolean;
  cloverChargeId: string | null;
  source: string;
};

export function CheckPaymentStatusButton({
  orderPublicId,
  disabled,
}: {
  orderPublicId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function onClick() {
    setBusy(true);
    startTransition(async () => {
      try {
        const res = await apiFetch<CheckResult>(
          `/api/orders/${encodeURIComponent(orderPublicId)}/payment-status`,
          { method: "POST" },
        );
        if (res.changed) {
          toast.success(`Payment ${res.cloverStatus} — local status updated`);
        } else {
          toast.message(`Clover status: ${res.cloverStatus} (no local change)`);
        }
        router.refresh();
      } catch {
        // apiFetch already toasts
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || busy || pending}
      onClick={onClick}
    >
      <RefreshCwIcon className={busy || pending ? "animate-spin" : undefined} />
      Check status
    </Button>
  );
}
