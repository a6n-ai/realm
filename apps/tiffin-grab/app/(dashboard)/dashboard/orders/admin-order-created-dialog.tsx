"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2Icon, CheckIcon, CopyIcon, ExternalLinkIcon, Loader2Icon, MailIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@foundry/design-system";
import { emailPaymentLinkAction } from "./actions";

export type AdminOrderCreated = {
  publicId: string;
  deploymentId: string;
  /** Set when staff attached a payment screenshot at create time. */
  paid?: { ok: true } | { ok: false; error: string };
};

export function createdSummary(result: AdminOrderCreated): string {
  return result.paid?.ok
    ? "Payment confirmed and the plan is active. The customer gets the confirmation email."
    : "No payment yet. Share the payment link, or email it to the customer. They get the plan confirmation once payment is approved.";
}

/** What staff do right after create: copy or email the pay link. Never the customer `/activate` page itself. */
export function AdminOrderCreatedPanel({ result, heading = false }: { result: AdminOrderCreated; heading?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState<"idle" | "sending" | "sent">("idle");

  const payPath = `/activate/${result.deploymentId}`;
  const payUrl = typeof window !== "undefined" ? `${window.location.origin}${payPath}` : payPath;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(payUrl);
      setCopied(true);
      toast.success("Customer payment link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  }

  async function emailLink() {
    setEmail("sending");
    const res = await emailPaymentLinkAction(result.publicId);
    if ("error" in res) {
      setEmail("idle");
      toast.error(res.error);
      return;
    }
    setEmail("sent");
    toast.success("Payment link emailed to the customer");
  }

  return (
    <div className="space-y-4">
      {heading && (
        <div className="grid gap-1">
          <p className="flex items-center gap-2 text-base font-semibold">
            <CheckCircle2Icon className="text-ok size-5" /> Order created
          </p>
          <p className="text-muted-foreground text-sm text-pretty">{createdSummary(result)}</p>
        </div>
      )}
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">Deployment</p>
        <p className="mt-0.5 font-medium nums">{result.deploymentId}</p>
      </div>
      {result.paid && !result.paid.ok ? (
        <p className="text-destructive text-sm" role="alert">
          The screenshot wasn&apos;t saved ({result.paid.error}). Add it from the order&apos;s Payments tab.
        </p>
      ) : null}
      {result.paid?.ok ? null : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Customer payment link</p>
          <p className="text-muted-foreground text-xs">
            Copy it into WhatsApp or SMS, or email the customer a sign-in link to pay. Both are optional.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={copyLink}>
              {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => void emailLink()} disabled={email !== "idle"}>
              {email === "sending" ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : email === "sent" ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <MailIcon data-icon="inline-start" />
              )}
              {email === "sent" ? "Emailed" : "Email payment link"}
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={payPath} target="_blank" rel="noreferrer">
                <ExternalLinkIcon data-icon="inline-start" />
                Open link
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Staff-only success after create, for flows that aren't a stepped sheet. */
export function AdminOrderCreatedDialog({
  open,
  onOpenChange,
  result,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: AdminOrderCreated | null;
}) {
  const router = useRouter();
  if (!result) return null;

  function viewOrder() {
    if (!result) return;
    onOpenChange(false);
    router.push(`/dashboard/orders/${result.publicId}`);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Order created"
      description={createdSummary(result)}
      contentClassName="sm:max-w-md"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={viewOrder}>View order</Button>
        </div>
      }
    >
      {/* Keyed so a second order starts with fresh copy/email state. */}
      <AdminOrderCreatedPanel key={result.publicId} result={result} />
    </ResponsiveDialog>
  );
}
