"use client";

import { AlertCircle, Info, Loader2 } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert";
import { Button } from "@/components/customer/kit";

export type PayOutcome =
  | { kind: "done" }
  | { kind: "confirm_surcharge"; surcharge: string; newTotal: string }
  | { kind: "busy" }
  | { kind: "error"; message: string };

export function Spinner({ show }: { show: boolean }) {
  return show ? <Loader2 aria-hidden className="animate-spin" /> : null;
}

export function ErrorAlert({ message, busy, onRetry }: { message: string; busy: boolean; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden />
      <AlertDescription>{message}</AlertDescription>
      {onRetry && (
        <AlertAction>
          <Button variant="quiet" size="lg" pending={busy} disabled={busy} onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}

export function SurchargeConfirm({ surcharge, newTotal, busy, onConfirm, onCancel }: {
  surcharge: string; newTotal: string; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="info">
        <Info aria-hidden />
        <AlertDescription>Credit cards carry a ${surcharge} card fee. New total ${newTotal}. Debit cards have no fee.</AlertDescription>
      </Alert>
      <Button variant="primary" size="lg" className="w-full" pending={busy} disabled={busy} onClick={onConfirm}>
        Pay ${newTotal}
      </Button>
      <Button variant="quiet" size="lg" className="w-full" onClick={onCancel}>Use a different card</Button>
    </div>
  );
}
