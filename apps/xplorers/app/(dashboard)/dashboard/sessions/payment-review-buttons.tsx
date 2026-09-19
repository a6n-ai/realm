"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { verifyPaymentAction, rejectPaymentAction } from "./payment-actions";

export function PaymentReviewButtons({ publicId, status }: { publicId: string; status: string }) {
  const [pending, start] = useTransition();
  if (status !== "pending_verification") return null;

  const run = (fn: (id: string) => Promise<{ error?: string }>, ok: string) =>
    start(async () => {
      const res = await fn(publicId);
      if (res?.error) toast.error(res.error);
      else toast.success(ok);
    });

  return (
    <div className="flex gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={() => run(verifyPaymentAction, "Marked paid")}>
        Confirm paid
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(rejectPaymentAction, "Rejected")}>
        Reject
      </Button>
    </div>
  );
}
