"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import {
  AdminOrderCreatedDialog,
  type AdminOrderCreated,
} from "@/app/(dashboard)/dashboard/orders/admin-order-created-dialog";
import {
  DeliverySection, DiscountsSection, PaymentSection, PlanSection, PriceSection, RunningPlansField,
} from "@/app/(dashboard)/dashboard/orders/new-order/order-sections";
import { estimatePrefill } from "@/app/(dashboard)/dashboard/discounts/estimate-actions";
import type { OrderFormInput } from "../order-schema";
import { useOrderDraft, type EstimateState, type EnabledSlot } from "./use-order-draft";
import type { Catalog } from "./order-draft";

export type { EstimateState };

/**
 * The order form for convert-inquiry, new-customer and the estimate dialog: the same sections as the
 * New order sheet, in one column. An estimate prices without a start date, address, coupons or Create.
 */
export function OrderForm({
  inquiryId,
  contact,
  catalog,
  enabledSlots,
  prefill,
  onCreate,
  onCreated,
  page,
  onContinue,
  estimateOnly = false,
  onEstimate,
}: {
  /** Price only, nothing is saved: the full order fields, no address required, no Create. */
  estimateOnly?: boolean;
  /**
   * Estimate only: the live price for a panel beside the form, the quote as text to copy, and a way to
   * apply a code issued there. Coupons, coins and the rep discount live in that panel, not here.
   */
  onEstimate?: (e: EstimateState) => void;
  /** Split into two steps: "order" = meal + schedule, "payment" = delivery + payment. Unset = one page. */
  page?: "order" | "payment";
  /** "order" page's Continue, after its fields validate. */
  onContinue?: () => void;
  inquiryId: string;
  contact: { fullName: string; phone: string; email: string };
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  prefill?: Partial<OrderFormInput>;
  /** Parent create path (New Order / New Customer). Must return ids; never redirect to `/activate`. */
  onCreate?: (order: CreateOrderInput) => Promise<AdminOrderCreated>;
  /** Called after success dialog is shown (e.g. close parent sheet). */
  onCreated?: (result: AdminOrderCreated) => void;
}) {
  const d = useOrderDraft({ inquiryId, contact, catalog, enabledSlots, prefill, onCreate, page, onContinue, hasSummary: false, estimateOnly, onEstimate });
  const { submitting, error, shownPreview, previewError, missing, created, successOpen, setSuccessOpen, customerCtx } = d;
  const [renewedFrom, setRenewedFrom] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);

  // Same as New order: a running plan pill fills this order from that plan. Not auto-picked here,
  // so an inquiry's own interest prefill stays until staff choose a plan to renew.
  async function renewFrom(orderPublicId: string, deploymentId: string) {
    setRenewingId(orderPublicId);
    const r = await estimatePrefill(orderPublicId).catch(() => ({ error: "Couldn't load that plan" }));
    setRenewingId(null);
    if ("error" in r) return toast.error(r.error);
    d.applyPrefill(r.prefill, r.addressPublicId);
    setRenewedFrom(orderPublicId);
    toast.success(`Filled from ${deploymentId}`);
  }

  return (
    <>
      <form onSubmit={d.onSubmit} className="relative flex flex-1 flex-col gap-6">
        {submitting && (
          <div role="status" aria-live="polite" className="bg-background/80 absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg backdrop-blur-sm">
            <Loader2Icon className="text-primary size-8 animate-spin" />
            <p className="text-sm font-medium">Creating order…</p>
          </div>
        )}

        {/* Hidden, not unmounted: a step switch must keep what staff already entered. */}
        <div className="flex flex-col gap-6">
          <div className={page === "payment" ? "hidden" : "flex flex-col gap-6"}>
            {customerCtx.conflict && (
              <p role="alert" className="text-destructive text-xs text-pretty">
                This phone number and this email belong to two different customers. Correct one of them before creating the order.
              </p>
            )}
            {!estimateOnly && (
              <RunningPlansField plans={customerCtx.plans} selectedId={renewedFrom} busyId={renewingId} onPick={(p) => void renewFrom(p.publicId, p.deploymentId)} />
            )}
            <PlanSection d={d} catalog={catalog} />
          </div>
          <div className={page === "order" ? "hidden" : "flex flex-col gap-6"}>
            <DeliverySection d={d} />
            <PaymentSection d={d} customerName={contact.fullName} />
            {!estimateOnly && <DiscountsSection d={d} customerLabel={contact.fullName || contact.email} />}
          </div>
          {!estimateOnly && !page && <PriceSection d={d} currency="CAD" />}
        </div>

        {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}

        {/* An estimate's last page has no action, and its side panel already shows the total. */}
        {!(estimateOnly && page === "payment") && (
          <div className="bg-background/80 supports-[backdrop-filter]:bg-background/60 border-border/60 sticky bottom-0 -mx-[var(--bar-inset,1rem)] mt-auto flex items-center justify-between gap-3 border-t px-[var(--bar-inset,1rem)] py-3 backdrop-blur-xl backdrop-saturate-150">
            <span className="text-sm">
              <span className="text-muted-foreground">Total </span>
              <span className="font-medium tabular-nums">{shownPreview ? `$${shownPreview.total.toFixed(2)}` : "—"}</span>
              {shownPreview && <span className="text-muted-foreground tabular-nums"> · {shownPreview.tiffinCount} {shownPreview.tiffinCount === 1 ? "tiffin" : "tiffins"}</span>}
            </span>
            <div className="flex flex-col items-end gap-1">
              {missing.length > 0 && <p className="text-muted-foreground text-xs">Still needed: {missing.join(", ")}</p>}
              {!shownPreview && previewError && missing.length === 0 && (
                <p role="alert" className="text-destructive max-w-80 text-right text-xs">{previewError}</p>
              )}
              {estimateOnly && page !== "order" ? null : page === "order" ? (
                // Distinct keys: reusing one <button> lets the async click land on the new type="submit" and create the order.
                <Button key="continue" type="button" disabled={missing.length > 0} onClick={() => void d.continueToPayment()}>
                  {estimateOnly ? "Continue" : "Continue to payment"}
                </Button>
              ) : (
                <Button key="submit" type="submit" disabled={submitting || missing.length > 0}>
                  {submitting ? <><Loader2Icon className="animate-spin" /> Creating…</> : "Create order"}
                </Button>
              )}
            </div>
          </div>
        )}
      </form>

      <AdminOrderCreatedDialog
        open={successOpen}
        onOpenChange={(open) => {
          setSuccessOpen(open);
          if (!open && created) onCreated?.(created);
        }}
        result={created}
      />
    </>
  );
}
