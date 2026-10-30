"use client";

import { PaymentInstructions } from "@/components/payment-instructions";
import { CalendarDaysIcon, CheckIcon, ChevronLeftIcon, CopyIcon, Loader2Icon, MinusIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@foundry/ui/cn";
import { Button } from "@foundry/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { Textarea } from "@foundry/ui/textarea";
import { Label } from "@foundry/ui/label";
import { AddressFields } from "@foundry/ui/address-fields";
import { DeliveryAreaNote } from "@/components/customer/address/delivery-area";
import { DropOffPicker } from "@/components/customer/address/drop-off";
import type { PricingResult } from "@/lib/pricing";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import type { CheckoutPaymentMethod } from "@/app/(public)/subscribe/actions";
import {
  AdminOrderCreatedDialog,
  type AdminOrderCreated,
} from "@/app/(dashboard)/dashboard/orders/admin-order-created-dialog";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import type { OrderFormInput } from "../order-schema";
import { toggleTrialPick } from "@/lib/trial/schedule";
import { discountLine } from "@/components/customer/home/coupons-section";
import { DayPicker, dayName, ScheduleSection } from "./schedule-section";
import { ScheduleCard } from "@/components/wizard/schedule-card";
import { PlanMealPicker } from "../../../_leads/plan-interest-fields";
import { DateInput } from "@/components/dashboard/date-fields";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { CustomerCodeField } from "../../../discounts/customer-code-field";
import { pillClass } from "../../../_leads/pill";
import { useOrderDraft, type EstimateState, type EnabledSlot } from "./use-order-draft";
import { dayBeforeIso, round2, type Catalog } from "./order-draft";


const APP_NAME = "Tiffin Grab";

/** One group of the order form: a heading, one line of help, an optional header control. */
function FormSection({ title, hint, action, hidden = false, children }: { title: string; hint?: string; action?: React.ReactNode; hidden?: boolean; children: React.ReactNode }) {
  // Hidden, not unmounted: a step switch must keep what staff already entered.
  return (
    <section className={cn("grid gap-4", hidden && "hidden")}>
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-0.5">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-balance">{title}</h3>
          {hint && <p className="text-muted-foreground text-[13px] text-pretty">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** CRM toggle pill for DropOffPicker and address types (the customer kit pill is public-site styled). */
function AdminPill({ on, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  // DropOffPicker passes the customer kit's sizing; the shared pill owns size here.
  return <button type="button" {...props} className={pillClass(on, className?.replace(/\b(h-10|text-\[14px\]|sm:text-\[14px\])\b/g, ""))} />;
}

function chargeHint(item: { chargeType: "none" | "fixed" | "percent"; chargeValue: number }): string {
  if (item.chargeType === "none" || item.chargeValue === 0) return "Free";
  return item.chargeType === "fixed" ? `+$${item.chargeValue.toFixed(2)}` : `+${item.chargeValue}%`;
}

export type { EstimateState };

export function OrderForm({
  inquiryId,
  contact,
  catalog,
  enabledSlots,
  prefill,
  onCreate,
  onCreated,
  onReview,
  paymentExtra,
  page,
  onContinue,
  summary,
  priceSummary,
  estimateOnly = false,
  onEstimate,
  onBack,
}: {
  /** Back to the previous step, from the sticky bar so staff never scroll up for it. */
  onBack?: () => void;
  /** Price only, nothing is saved: the full order + coupon fields, no address required, no Create. */
  estimateOnly?: boolean;
  /**
   * Estimate only: the live price for a panel beside the form, the quote as text to copy, and a way to
   * apply a code issued there. The rep discount is hidden here: it is staff-applied, so a customer who
   * orders on the website can't get it; the panel issues them a code instead.
   */
  onEstimate?: (e: EstimateState) => void;
  /** Split into two steps: "order" = meal + schedule, "payment" = delivery + payment + review. Unset = one page. */
  page?: "order" | "payment";
  /** "order" page's Continue, after its fields validate. */
  onContinue?: () => void;
  /** Review block on top of the "payment" page, fed the live order and price. */
  summary?: (draft: { order: CreateOrderInput; preview: PricingResult | null }) => React.ReactNode;
  /** Price block under the delivery address on the "payment" page. */
  priceSummary?: (draft: { order: CreateOrderInput; preview: PricingResult | null }) => React.ReactNode;
  inquiryId: string;
  contact: { fullName: string; phone: string; email: string };
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  prefill?: Partial<OrderFormInput>;
  /** Parent create path (New Order / New Customer). Must return ids — never redirect to `/activate`. */
  onCreate?: (order: CreateOrderInput) => Promise<AdminOrderCreated>;
  /** Called after success dialog is shown (e.g. close parent sheet). */
  onCreated?: (result: AdminOrderCreated) => void;
  /**
   * When set, the sticky CTA advances to a parent Review step instead of creating.
   * Requires a live price preview — create stays on the review step.
   */
  onReview?: (draft: { order: CreateOrderInput; preview: PricingResult }) => void;
  /** Extra content under the payment methods, given the selected method (e.g. an e-Transfer screenshot). */
  paymentExtra?: (paymentMethodId: string | null) => React.ReactNode;
}) {
  const d = useOrderDraft({ inquiryId, contact, catalog, enabledSlots, prefill, onCreate, onReview, page, onContinue, hasSummary: summary != null, estimateOnly, onEstimate });
  const { realPayments, form, submitting, error, preview, previewError, repInfo, discount, setDiscount, discountOpen, setDiscountOpen, couponInput, setCouponInput, coupons, couponCodes, removeCoupon, applyCoupon, applyAllCoupons, applyStaffCode, paymentMethods, paymentMethodId, setPaymentMethodId, created, successOpen, setSuccessOpen, customerCtx, renewFrom, deliveryOptions, addressPublicId, pickSavedAddress, notes, setNotes, addressTagId, setAddressTagId, dropOff, setDropOff, dropOffs, planKey, mealSizeId, frequencyKey, eatingDays, startDate, addressLine, city, postalCode, deliveryArea, deliveryFrequencies, bounds, sizeDays, toggleEating, durations, eligibleAddons, qtyFor, setAddonQty, isTrial, trialOpen, multiDayTrial, trialFrequencyName, trialWeekdays, trialMax, pickedDays, setPickedDays, trialStartOk, minStart, renewalBound, renewalStart, schedule, subtotal, ceiling, missing, liveDraft, continueToPayment, onSubmit, shownPreview } = d;

  // Staff paste this into WhatsApp/SMS; the order code isn't known until create.
  async function copyPaymentDetails(m: CheckoutPaymentMethod) {
    const amount = shownPreview ? `$${shownPreview.total.toFixed(2)}` : "the order total";
    const lines = [
      `Hi ${contact.fullName.split(" ")[0] || "there"}, your ${APP_NAME} order total is ${amount}.`,
      m.id === "etransfer"
        ? `Please send an Interac e-Transfer of ${amount}${m.payeeHandle ? ` to ${m.payeeHandle}` : ""} with your name in the message, and share the screenshot with us.`
        : `Payment method: ${m.label}${m.payeeHandle ? ` (${m.payeeHandle})` : ""}.`,
      m.instructions?.trim() || null,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Payment details copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={onSubmit} className="@container relative flex flex-1 flex-col gap-6">
          {submitting && (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-sm"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2Icon className="text-primary size-8 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium">Creating order…</p>
                <p className="text-muted-foreground text-xs">
                  Pricing, payment, and schedule — this can take a few seconds.
                </p>
              </div>
            </div>
          )}

          {/* Two columns once the container is wide (New order sheet); the narrow estimate pane stays one. */}
          <div className="grid items-start gap-x-8 gap-y-6 @3xl:grid-cols-2">
            <div className="grid min-w-0 content-start gap-6">
          <FormSection hidden={page === "payment"} title="Meal">
            <fieldset className="grid gap-4" disabled={submitting}>
              <FormField
                control={form.control}
                name="planKey"
                render={({ field }) => (
                  <FormItem className="hidden">
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mealSizeId"
                render={({ field }) => (
                  <FormItem className="hidden">
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )}
              />
              {(
                <div className="grid gap-4">
                  <PlanMealPicker
                    catalog={catalog}
                    planKey={planKey}
                    mealSizeId={mealSizeId}
                    planRequired
                    onPlanChange={(key) => form.setValue("planKey", key, { shouldDirty: true, shouldValidate: true })}
                    onMealChange={(id) => form.setValue("mealSizeId", id, { shouldDirty: true, shouldValidate: true })}
                  />
                </div>
              )}
            </fieldset>

          {eligibleAddons.length > 0 && (
            <fieldset className="grid gap-2" disabled={submitting}>
              <div className="flex items-baseline justify-between gap-3">
                <legend className="text-sm font-medium text-foreground">Add-ons</legend>
                <p className="text-muted-foreground text-xs">Optional · billed per tiffin</p>
              </div>
              {/* Tap to add one; a picked add-on turns into its own stepper, so the list stays one tile per item. */}
              <div className="grid grid-cols-2 gap-2">
                {eligibleAddons.map((addon) => {
                  const qty = qtyFor(addon.key);
                  const label = (
                    <span className="min-w-0 truncate" title={addon.portion ?? undefined}>
                      {addon.name} <span className="text-muted-foreground font-normal tabular-nums">${addon.pricePerTiffin.toFixed(2)}</span>
                    </span>
                  );
                  return qty > 0 ? (
                    <div key={addon.key} role="group" aria-label={`${addon.name} quantity`} className={pillClass(true, "justify-between pr-0.5")}>
                      {label}
                      <span className="flex shrink-0 items-center">
                        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove one ${addon.name}`} onClick={() => setAddonQty(addon.key, qty - 1)}>
                          <MinusIcon />
                        </Button>
                        <span className="w-4 text-center tabular-nums" aria-live="polite">{qty}</span>
                        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Add one ${addon.name}`} disabled={qty >= addon.maxQty} onClick={() => setAddonQty(addon.key, qty + 1)}>
                          <PlusIcon />
                        </Button>
                      </span>
                    </div>
                  ) : (
                    <AdminPill key={addon.key} aria-label={`Add ${addon.name}`} on={false} onClick={() => setAddonQty(addon.key, 1)} className="justify-between">
                      {label}
                      <PlusIcon className="size-3.5 shrink-0" />
                    </AdminPill>
                  );
                })}
              </div>
            </fieldset>
          )}
          </FormSection>
          <FormSection hidden={page === "order"} title="Delivery" hint={estimateOnly ? "Only what changes the price: the postal code sets the tax; address type and drop-off can add fees." : "Where it goes, notes for the driver, and how it's dropped off."}>
          <fieldset className="space-y-4" disabled={submitting}>
            {!estimateOnly && customerCtx.addresses.length > 0 && (
              <div className="grid gap-2" role="radiogroup" aria-label="Saved addresses">
                <p className="text-sm font-medium">Saved addresses</p>
                {customerCtx.addresses.map((a) => {
                  const on = addressPublicId === a.publicId;
                  return (
                    <button
                      key={a.publicId}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => pickSavedAddress(on ? null : a.publicId)}
                      className={cn("flex items-start justify-between gap-3 rounded-lg border p-3 text-left text-sm transition-colors", on ? "border-primary bg-primary/5" : "hover:bg-muted/40")}
                    >
                      <span className="grid gap-0.5">
                        <span className="font-medium">
                          {a.label}{a.isDefault ? <span className="text-muted-foreground font-normal"> · Default</span> : null}
                        </span>
                        <span className="text-muted-foreground">{[a.addressUnit, a.addressLine, a.city, a.postalCode].filter(Boolean).join(", ")}</span>
                        {a.deliveryInstructions ? <span className="text-muted-foreground text-xs">Notes: {a.deliveryInstructions}</span> : null}
                      </span>
                      {on && <CheckIcon className="text-primary mt-0.5 size-4 shrink-0" />}
                    </button>
                  );
                })}
                <button
                  type="button"
                  role="radio"
                  aria-checked={addressPublicId == null}
                  onClick={() => pickSavedAddress(null)}
                  className={cn("rounded-lg border p-3 text-left text-sm font-medium transition-colors", addressPublicId == null ? "border-primary bg-primary/5" : "hover:bg-muted/40")}
                >
                  A new address
                </button>
              </div>
            )}
            <fieldset className="grid gap-2" disabled={addressPublicId != null}>
              <AddressFields
                idPrefix="order"
                fields={estimateOnly ? ["postalCode"] : ["addressLine", "city", "postalCode"]}
                values={{ addressLine, city, postalCode }}
                onChange={(patch) => {
                  for (const key of ["addressLine", "city", "postalCode"] as const) {
                    if (patch[key] !== undefined) form.setValue(key, patch[key], { shouldDirty: true, shouldValidate: true });
                  }
                }}
                errors={{
                  addressLine: form.formState.errors.addressLine?.message,
                  city: form.formState.errors.city?.message,
                  postalCode: form.formState.errors.postalCode?.message,
                }}
                resolveUrl="/api/address/resolve"
              />
              <DeliveryAreaNote area={deliveryArea} />
            </fieldset>
            {!estimateOnly && <div className="grid gap-2">
              <Label htmlFor="order-delivery-notes">Delivery notes</Label>
              <Textarea
                id="order-delivery-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={addressPublicId != null}
                placeholder="Buzzer code, leave at door, call on arrival…"
                rows={2}
                maxLength={500}
              />
              {addressPublicId != null && (
                <p className="text-muted-foreground text-xs">From the saved address. Change it on the customer&apos;s address book, or pick A new address.</p>
              )}
            </div>}
            {deliveryOptions?.deliveryCharges && deliveryOptions.deliveryCharges.addressTags.length > 0 && (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Address type</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Address type">
                  {deliveryOptions.deliveryCharges.addressTags.map((tag) => (
                    <AdminPill key={tag.id} role="radio" aria-checked={addressTagId === tag.id} on={addressTagId === tag.id} onClick={() => setAddressTagId(addressTagId === tag.id ? null : tag.id)}>
                      {tag.name}
                      <span className="text-muted-foreground text-xs">{chargeHint(tag)}</span>
                    </AdminPill>
                  ))}
                </div>
              </div>
            )}
            <DropOffPicker catalog={dropOffs} value={dropOff} onChange={setDropOff} disabled={submitting} Pill={AdminPill} />
          </fieldset>
          </FormSection>
          <FormSection hidden={page === "order"} title="Payment" hint={estimateOnly ? "The method can add its own taxes and unlock method-only coupons." : realPayments ? "How the customer pays. Attach proof if they already paid; otherwise share the payment link after create." : undefined}>
          <fieldset className="space-y-3" disabled={submitting}>
            {realPayments ? (
              <>
                <div className="grid gap-2">
                  {paymentMethods.map((m) => {
                    const selected = m.id === paymentMethodId;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "rounded-lg border transition-colors",
                          selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setPaymentMethodId(m.id)}
                          className="flex w-full items-center justify-between gap-2 p-3 text-left"
                        >
                          <span className="font-medium">{m.label}</span>
                          {selected && <CheckIcon className="text-primary size-4" />}
                        </button>
                        {/* Outside the select button: the copy button can't nest inside it. */}
                        {selected ? (
                          <div className="grid gap-2 px-3 pb-3">
                            <PaymentInstructions payeeHandle={m.payeeHandle} instructions={m.instructions} />
                            {/* An online method (card) has nothing to pay to until the order exists; its link comes after create. */}
                            {m.payeeHandle || m.instructions?.trim() ? (
                              <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => void copyPaymentDetails(m)}>
                                <CopyIcon className="size-4" /> Copy payment details
                              </Button>
                            ) : (
                              <p className="text-muted-foreground text-xs text-pretty">Copy or email the {m.label.toLowerCase()} payment link after Create order.</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {paymentExtra?.(paymentMethodId)}
              </>
            ) : (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <ShieldCheckIcon className="size-4" /> Simulated — no real payment methods enabled.
              </p>
            )}
          </fieldset>

          {/* An estimate lists coupons in its side panel (onEstimate). */}
          {!estimateOnly && (
          <fieldset className="space-y-2" disabled={submitting}>
            <Label htmlFor="couponCode">Coupon</Label>
            {coupons?.applied.map((c) => (
              <div key={c.code} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span>
                  <span className="nums font-medium">{c.code}</span>{" "}
                  <span className="text-muted-foreground">{c.auto ? "Applied automatically" : c.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="nums">−${c.amount.toFixed(2)}</span>
                  {!c.auto && <Button type="button" variant="ghost" size="sm" onClick={() => removeCoupon(c.code)}>Remove</Button>}
                </span>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                id="couponCode"
                value={couponInput}
                placeholder="Enter code"
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                // Enter would otherwise submit the order form.
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (couponInput.trim()) applyCoupon(couponInput); } }}
              />
              <Button type="button" variant="outline" disabled={!couponInput.trim()} onClick={() => applyCoupon(couponInput)}>Apply</Button>
            </div>
            {coupons && couponCodes
              .filter((code) => !coupons.applied.some((c) => c.code.toUpperCase() === code))
              .map((code) => {
                const why = coupons.codeErrors.find((e) => e.code === code)?.error
                  ?? coupons.notApplied.find((n) => n.code.toUpperCase() === code)?.reason
                  ?? "Not applied";
                return (
                  <p key={code} role="alert" className="text-destructive flex items-center gap-2 text-sm">
                    <span><span className="nums">{code}</span>: {why}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeCoupon(code)}>Remove</Button>
                  </p>
                );
              })}
            {coupons?.error && <p role="alert" className="text-destructive text-sm">{coupons.error}</p>}
            {coupons && coupons.available.some((c) => !couponCodes.includes(c.code.toUpperCase())) && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">Available</span>
                {coupons.available.filter((c) => !couponCodes.includes(c.code.toUpperCase())).length > 1 && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => applyAllCoupons(coupons.available.map((c) => c.code))}>
                    Apply all applicable
                  </Button>
                )}
                {coupons.available.filter((c) => !couponCodes.includes(c.code.toUpperCase())).map((c) => (
                  <Button key={c.code} type="button" variant="outline" size="sm" title={c.name} onClick={() => applyCoupon(c.code)}>
                    <span className="nums">{c.code}</span> · {discountLine(c)}
                  </Button>
                ))}
              </div>
            )}
          </fieldset>
          )}

          {!estimateOnly && (
            <CustomerCodeField onOrder subtotal={subtotal} apply={applyStaffCode} note={`New order: ${contact.fullName || contact.email}`} />
          )}

          {!estimateOnly && repInfo && !(repInfo.available === false && repInfo.reason === "disabled") && (
            <fieldset className="space-y-3" disabled={submitting}>
              {!discountOpen && discount === 0 ? (
                <button
                  type="button"
                  onClick={() => setDiscountOpen(true)}
                  className="text-primary hover:text-primary/80 min-h-11 text-sm font-medium underline-offset-4 hover:underline sm:min-h-0"
                >
                  {repInfo.available ? "Apply rep discount" : "Rep discount"}
                </button>
              ) : repInfo.available ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{repInfo.name} <span className="nums">({repInfo.code})</span></span>
                    <span className="text-muted-foreground text-xs">
                      Up to {repInfo.capPct}% or ${repInfo.capAmount.toFixed(2)}, whichever is lower
                    </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label htmlFor="repDiscount">Discount amount</Label>
                      <Input
                        id="repDiscount"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={ceiling}
                        step={0.01}
                        value={discount ? String(discount) : ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setDiscount(Number.isFinite(n) ? Math.max(0, Math.min(round2(n), ceiling)) : 0);
                        }}
                      />
                    </div>
                    <Button type="button" variant="outline" onClick={() => setDiscount(ceiling)} disabled={ceiling <= 0}>Max</Button>
                    {discount > 0 && <Button type="button" variant="ghost" onClick={() => setDiscount(0)}>Clear</Button>}
                  </div>
                  <p className="text-muted-foreground text-xs nums">Ceiling for this order: ${ceiling.toFixed(2)}</p>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {repInfo.reason === "used"
                    ? "Today's coupon was already used."
                    : repInfo.reason === "expired"
                      ? "Today's coupon has expired."
                      : "No discount available today."}
                </p>
              )}
            </fieldset>
          )}

          </FormSection>
            </div>
            <div className="grid min-w-0 content-start gap-6">
          {liveDraft && <section className="grid gap-5">{summary!(liveDraft)}</section>}
          <FormSection hidden={page === "payment"} title="Schedule" hint={isTrial ? `${multiDayTrial ? "Pick the days the trial arrives" : "A one-day trial arrives on its start date"}${trialFrequencyName ? ` · ${trialFrequencyName}` : ""}.` : undefined}>
            <fieldset className="grid gap-4" disabled={submitting}>
              {!isTrial && (
              <FormField
                control={form.control}
                name="durationWeeks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration <span className="text-destructive">*</span></FormLabel>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Duration">
                      {durations.map((d) => (
                        <AdminPill key={d.weeks} role="radio" aria-checked={Number(field.value) === d.weeks} on={Number(field.value) === d.weeks} onClick={() => field.onChange(d.weeks)} className="justify-center tabular-nums">
                          {d.weeks} wk
                        </AdminPill>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              )}
              {/* An estimate prices without a start date; only a real order needs one. */}
              {!estimateOnly && (
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date <span className="text-destructive">*</span></FormLabel>
                    <FormControl><DateInput min={minStart} value={field.value} onChange={field.onChange} className="w-full sm:max-w-xs" /></FormControl>
                    {renewalBound ? (
                      <p className="text-muted-foreground text-xs text-pretty">
                        Renewal: current plan runs through {dayBeforeIso(renewFrom!)}. The new plan starts on or after{" "}
                        <button type="button" className="text-primary font-medium underline-offset-2 hover:underline" onClick={() => form.setValue("startDate", renewalStart!, { shouldDirty: true, shouldValidate: true })}>
                          {renewalStart}
                        </button>.
                      </p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
              )}
            </fieldset>

          {customerCtx.conflict && (
            <p className="text-destructive text-xs text-pretty">
              This phone number and this email belong to two different customers. Correct one of them before creating the order.
            </p>
          )}
          {customerCtx.plans.length > 0 && (
            <div className="bg-muted/40 grid gap-1.5 rounded-md border p-3 text-xs">
              <p className="font-medium">This customer&apos;s running plans</p>
              <ul className="text-muted-foreground grid gap-1">
                {customerCtx.plans.map((p) => (
                  <li key={p.publicId}>
                    <a href={`/dashboard/orders/${p.publicId}`} target="_blank" rel="noreferrer" className="text-primary font-medium underline-offset-2 hover:underline">
                      {p.deploymentId}
                    </a>
                    {" · "}{p.mealSize}{" · "}<span className="capitalize">{p.status}</span>{" · "}{p.startDate} to {p.lastDay}{" · "}{p.tiffinCount} tiffins
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isTrial && (
            <fieldset className="grid gap-2" disabled={submitting}>
              {trialOpen && multiDayTrial && (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">Trial days</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      <span className="text-foreground font-semibold">{pickedDays.length}</span> of {trialMax} days
                    </p>
                  </div>
                  <DayPicker
                    label="Trial days"
                    selected={pickedDays}
                    onToggle={(d) => setPickedDays((prev) => toggleTrialPick(prev, d, trialWeekdays, trialMax) as DayOfWeek[])}
                    isDisabled={(d, on) => !on && (!trialWeekdays.includes(d) || pickedDays.length >= trialMax)}
                  />
                </>
              )}
              {!(trialOpen && startDate && trialStartOk) && (
                <p className={cn("text-xs text-pretty", trialOpen && startDate ? "text-destructive" : "text-muted-foreground")}>
                  {!trialOpen
                    ? "Set a max and send days on Meal sizes → Trial before creating a trial order."
                    : !startDate
                      ? `Trials go out ${trialWeekdays.map(dayName).join(", ")}. Pick a start date.`
                      : `Start on ${(multiDayTrial ? pickedDays : trialWeekdays).map(dayName).join(" or ")}.`}
                </p>
              )}
            </fieldset>
          )}

          {!isTrial && <fieldset disabled={submitting}>
            <ScheduleSection
              frequencies={deliveryFrequencies.map((f) => ({ key: f.key, name: f.name, weekdays: f.weekdays as DayOfWeek[], savePct: f.savePct }))}
              frequencyKey={frequencyKey}
              // Delivery type only: eating days stay as chosen, so the tiffin count never changes silently.
              onFrequencyChange={(key) => form.setValue("frequencyKey", key, { shouldDirty: true, shouldValidate: true })}
              eatingDays={eatingDays}
              onToggleDay={toggleEating}
              bounds={bounds}
              mealDays={sizeDays}
            />
          </fieldset>}
          {schedule && (
            // Collapsed: the day-by-day calendar is a check, not a choice, and it is the tallest block here.
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="justify-self-start">
                  <CalendarDaysIcon /> {schedule.trips.length} {schedule.trips.length === 1 ? "delivery" : "deliveries"} · show calendar
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <ScheduleCard trips={schedule.trips} shifted={schedule.shifted} />
              </CollapsibleContent>
            </Collapsible>
          )}
          </FormSection>
          {liveDraft && priceSummary && <section className="grid gap-5">{priceSummary(liveDraft)}</section>}
            </div>
          </div>

          {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}

          {/* Glass action bar: Back, the live total and the next step stay in reach at any scroll. */}
          <div className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky bottom-0 -mx-[var(--bar-inset,1rem)] mt-auto flex items-center justify-between gap-3 border-t border-border/60 px-[var(--bar-inset,1rem)] py-3 backdrop-blur-xl backdrop-saturate-150">
            <div className="flex items-center gap-3 text-sm">
              {onBack && (
                <Button type="button" variant="outline" disabled={submitting} onClick={onBack}>
                  <ChevronLeftIcon /> Back
                </Button>
              )}
              <span>
              <span className="text-muted-foreground">Total </span>
              <span className="nums font-medium">{shownPreview ? `$${shownPreview.total.toFixed(2)}` : "—"}</span>
              {shownPreview ? <span className="text-muted-foreground nums"> · {shownPreview.tiffinCount} {shownPreview.tiffinCount === 1 ? "tiffin" : "tiffins"}</span> : null}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              {missing.length > 0 && <p className="text-muted-foreground text-xs">Still needed: {missing.join(", ")}</p>}
              {!shownPreview && previewError && missing.length === 0 && (
                <p role="alert" className="text-destructive max-w-80 text-right text-xs">{previewError}</p>
              )}
              {estimateOnly && page !== "order" ? null : page === "order" ? (
                // Distinct keys: reusing one <button> lets the async click land on the new type="submit" and create the order.
                <Button key="continue" type="button" disabled={missing.length > 0} onClick={() => void continueToPayment()}>
                  {estimateOnly ? "Continue" : "Continue to payment"}
                </Button>
              ) : (
              <Button key="submit" type="submit" disabled={submitting || missing.length > 0 || (onReview != null && !shownPreview)}>
                {submitting ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Creating…
                  </>
                ) : onReview && page !== "payment" ? (
                  "Review order"
                ) : (
                  "Create order"
                )}
              </Button>
              )}
            </div>
          </div>
        </form>
      </Form>

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
