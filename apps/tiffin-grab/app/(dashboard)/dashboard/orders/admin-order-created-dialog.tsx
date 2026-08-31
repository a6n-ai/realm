"use client";

import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@foundry/design-system";

export type AdminOrderCreated = {
  publicId: string;
  deploymentId: string;
};

/** Staff-only success after create — never the customer `/activate` page. */
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
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  const payPath = `/activate/${result.deploymentId}`;
  const payUrl =
    typeof window !== "undefined" ? `${window.location.origin}${payPath}` : payPath;

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
      description="Share the payment link with the customer, then open the order to manage deliveries."
      contentClassName="sm:max-w-md"
      footer={
        <div className="flex flex-wrap justify-end gap-2 px-4 pb-2 md:px-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={viewOrder}>View order</Button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-2 md:px-0">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Deployment</p>
          <p className="mt-0.5 font-medium nums">{result.deploymentId}</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Customer payment link</p>
          <p className="text-muted-foreground text-xs">
            Ask the customer to open this link to complete payment with the method you selected.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={copyLink}>
              {copied ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <CopyIcon data-icon="inline-start" />
              )}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={payPath} target="_blank" rel="noreferrer">
                <ExternalLinkIcon data-icon="inline-start" />
                Open link
              </a>
            </Button>
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
