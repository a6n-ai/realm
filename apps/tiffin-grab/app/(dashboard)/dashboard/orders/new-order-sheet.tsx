"use client";

import type { Country as CountryCode } from "react-phone-number-input";
import { useEffect, useState } from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import dynamic from "next/dynamic";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { isValidPhone } from "@foundry/ui/phone-input";
import type { PricingResult } from "@/lib/pricing";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import { InquiryMatch } from "../_leads/inquiry-match";
import { CustomerSearch } from "../_leads/customer-search";
import { StepHeader } from "../_leads/step-header";
import { useExistingCustomer } from "../_leads/use-existing-customer";
import type { CustomerHit } from "../_leads/match-actions";
import { getInquiryInterestForPrefill } from "../_leads/match-actions";
import { NoSources } from "../_leads/no-sources";
import type { OrderFormInput } from "../inquiries/[id]/order-schema";
import { OrderForm } from "../inquiries/[id]/order/order-form";
import { interestToPrefill } from "../inquiries/_leads/interest-prefill";
import { unwrapAction } from "@/lib/actions/unwrap";
import { OrderPricingBreakdown } from "./[id]/order-pricing-breakdown";
import {
  AdminOrderCreatedDialog,
  type AdminOrderCreated,
} from "./admin-order-created-dialog";
import { createOrderFlow, settleNewOrderWithProofAction } from "./actions";
import { PaymentProofField, type PaymentProofValue } from "./payment-proof-field";
import { makeImageThumbnail } from "@/components/ds";
import {
  CustomMealBuilder, filledItems, type CustomMealCategory, type CustomMealValue,
} from "./custom-meal-builder";
import { TrialPill } from "./trial-pill";
import { FormDrawer } from "./form-drawer";

type Src = { key: string; label: string; subs: { key: string; label: string }[] };

type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string; trial?: boolean }[];
  frequencies: { key: string; name: string; weekdays?: string[] | null; savePct?: number }[];
  minTiffinsPerWeek?: number;
  maxTiffinsPerWeek?: number;
  durations: { weeks: number }[];
};

type EnabledSlot = { key: string; label: string };

type OrderDraft = { order: CreateOrderInput; preview: PricingResult };

const DAY_LABEL: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground/80 text-[0.7rem] font-semibold tracking-[0.08em] uppercase">
      {children}
    </p>
  );
}

function Req() {
  return <span className="text-primary">*</span>;
}

const PhoneInput = dynamic(() => import("@foundry/ui/phone-input").then((m) => m.PhoneInput), {
  ssr: false,
  loading: () => <Input disabled placeholder="Phone" />,
});

/**
 * Three-step New order — mirrors New inquiry contact, then catalog plan (with an
 * optional e-Transfer screenshot under payment that approves the payment on create),
 * then a verify step with plan summary + price breakup before create:
 *   1. Contact + Source (optional sub-source)
 *   2. Catalog / custom meal + schedule + delivery + payment
 *   3. Review plan & pricing → Create order
 * Matched open inquiries prefill step 2 so convert doesn't re-ask.
 */
export function NewOrderSheet({
  triggerLabel,
  open: controlledOpen,
  onOpenChange,
  defaultCountry,
  sources,
  catalog,
  categories,
  currency = "CAD",
}: {
  /** Renders the sheet's own trigger button; omit when the sheet is opened by `open`. */
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultCountry: CountryCode;
  sources: Src[];
  catalog: Catalog;
  categories: CustomMealCategory[];
  currency?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  // Meal slots and custom-meal categories are the same enabled dish-category rows.
  const enabledSlots: EnabledSlot[] = categories.map((c) => ({ key: c.key, label: c.label }));
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [paidNow, setPaidNow] = useState(false);
  const [sourceKey, setSourceKey] = useState(sources[0]?.key ?? "manual");
  const [subSourceKey, setSubSourceKey] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [pickedCustomerId, setPickedCustomerId] = useState<string | null>(null);
  const [customMeal, setCustomMeal] = useState<CustomMealValue | null>(null);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<AdminOrderCreated | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [proof, setProof] = useState<PaymentProofValue>({ file: null, reference: "" });
  // Keyed by the inquiry it was fetched for, so clearing the pick derives an empty
  // prefill instead of writing one synchronously in the effect below.
  const [fetchedPrefill, setFetchedPrefill] = useState<{
    forId: string;
    prefill: Partial<OrderFormInput>;
  } | null>(null);
  const interestPrefill = pickedId && fetchedPrefill?.forId === pickedId ? fetchedPrefill.prefill : {};

  const subs = sources.find((s) => s.key === sourceKey)?.subs ?? [];
  const phoneValid = isValidPhone(phone);
  const existingCustomer = useExistingCustomer(phone, email, pickedCustomerId);
  const contactReady =
    fullName.trim().length > 0 &&
    phone.trim().length > 0 &&
    email.trim().length > 0 &&
    !existingCustomer;

  function onPick(id: string | null, lockedSourceKey?: string) {
    setPickedId(id);
    if (id && lockedSourceKey) {
      setSourceKey(lockedSourceKey);
      setSubSourceKey("");
    }
  }

  function pickCustomer(c: CustomerHit) {
    setFullName(c.fullName ?? "");
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setPickedCustomerId(c.publicId);
  }

  useEffect(() => {
    if (!pickedId) return;
    let cancelled = false;
    getInquiryInterestForPrefill(pickedId)
      .then((interest) => {
        if (cancelled) return;
        const { prefill } = interestToPrefill(interest, {
          plans: catalog.plans,
          mealSizes: catalog.mealSizes,
        });
        setFetchedPrefill({ forId: pickedId, prefill });
      })
      .catch(() => {
        if (!cancelled) setFetchedPrefill({ forId: pickedId, prefill: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [pickedId, catalog.plans, catalog.mealSizes]);

  const prefill: Partial<OrderFormInput> = {
    email: email.trim(),
    ...interestPrefill,
  };

  function resetAndClose(o: boolean) {
    setOpen(o);
    if (!o) {
      setStep(1);
      setFetchedPrefill(null);
      setCustomMeal(null);
      setDraft(null);
      setCreateError(null);
      setCreated(null);
      setSuccessOpen(false);
      setProof({ file: null, reference: "" });
      setPaidNow(false);
    }
  }

  async function createFromDraft() {
    if (!draft) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await unwrapAction(createOrderFlow({
        source: { sourceKey, subSourceKey: subSourceKey || undefined },
        contact: { fullName, phone, email: email.trim() },
        interest: {
          planInterest: draft.order.planKey || undefined,
          mealSizeInterest: customMeal ? undefined : draft.order.selections.mealSizeId,
          personsInterest: draft.order.selections.persons,
          frequencyKeyInterest: draft.order.selections.frequencyKey,
          eatingDaysInterest: draft.order.selections.eatingDays,
          postalCode: draft.order.contact.postalCode,
          preferredStart: draft.order.selections.startDate,
        },
        pickedInquiryId: pickedId ?? undefined,
        order: draft.order,
        customMeal: customMeal
          ? { planKey: customMeal.planKey, items: filledItems(customMeal.items), basePriceOverride: customMeal.basePriceOverride }
          : undefined,
      }));
      let paid: AdminOrderCreated["paid"];
      if (paidNow && proof.file && isEtransfer) {
        // Order already exists; a failed upload must not hide that, so it is
        // reported on the success dialog rather than thrown.
        const form = new FormData();
        const thumb = await makeImageThumbnail(proof.file);
        form.set("proof", proof.file);
        form.set("proof_thumb", thumb, thumb.name);
        if (proof.reference.trim()) form.set("reference", proof.reference.trim());
        const settled = await settleNewOrderWithProofAction(result.publicId, form);
        paid = "error" in settled ? { ok: false, error: settled.error } : { ok: true };
      }
      setCreated({ ...result, paid });
      setSuccessOpen(true);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setCreating(false);
    }
  }

  const mealLabel = customMeal
    ? "Custom meal"
    : (catalog.mealSizes.find((m) => m.id === draft?.order.selections.mealSizeId)?.name ?? "Meal");
  const planLabel = customMeal
    ? (catalog.plans.find((p) => p.key === customMeal.planKey)?.name ?? customMeal.planKey)
    : (catalog.plans.find((p) => p.key === draft?.order.planKey)?.name
      ?? catalog.mealSizes.find((m) => m.id === draft?.order.selections.mealSizeId)?.diet
      ?? "");
  const frequencyLabel = catalog.frequencies.find((f) => f.key === draft?.order.selections.frequencyKey)?.name;
  const eating = draft?.order.selections.eatingDays ?? [];
  const trialDays = draft?.order.selections.trialDays;
  const isEtransfer = draft?.order.paymentMethodId === "etransfer";

  return (
    <>
      <FormDrawer
        // Step bar and panels run edge to edge; each panel pads itself.
        flush
        open={open}
        onOpenChange={resetAndClose}
        trigger={
          triggerLabel ? (
            <Button>
              <PlusIcon className="size-4" />
              {triggerLabel}
            </Button>
          ) : undefined
        }
        title="New order"
        description="Contact, plan, then verify pricing before create."
        footer={
          sources.length > 0 && step === 1 ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                disabled={!contactReady}
                onClick={() => setStep(2)}
                className="min-h-11 active:scale-[0.96] sm:min-h-9"
              >
                Continue
              </Button>
            </div>
          ) : sources.length > 0 && step === 3 ? (
            <div className="flex w-full items-center justify-between gap-3">
              <div className="text-sm">
                <span className="text-muted-foreground">Total </span>
                <span className="nums font-medium">
                  {draft ? `$${draft.preview.total.toFixed(2)}` : "—"}
                </span>
                {draft ? (
                  <span className="text-muted-foreground nums"> · {draft.preview.tiffinCount} tiffins</span>
                ) : null}
              </div>
              <Button
                disabled={!draft || creating}
                onClick={() => void createFromDraft()}
                className="min-h-11 active:scale-[0.96] sm:min-h-9"
              >
                {creating ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create order"
                )}
              </Button>
            </div>
          ) : undefined
        }
      >
        {sources.length === 0 ? (
          <NoSources noun="order" />
        ) : (
          <>
            <StepHeader step={step} steps={["Contact", "Order", "Review"]} />

            {step === 1 ? (
              <div className="space-y-6 px-5 py-5 sm:px-6">
                <CustomerSearch onPick={pickCustomer} />

                <section className="grid gap-4">
                  <SectionLabel>Source</SectionLabel>
                  <div className="grid gap-1.5">
                    <Label>
                      Where did they come from? <Req />
                    </Label>
                    <div role="radiogroup" aria-label="Source" className="flex flex-wrap gap-2">
                      {sources.map((s) => {
                        const active = sourceKey === s.key;
                        return (
                          <button
                            key={s.key}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => {
                              setSourceKey(s.key);
                              setSubSourceKey("");
                              setPickedId(null);
                            }}
                            className={cn(
                              "min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
                              active
                                ? "border-primary/30 bg-primary/12 text-primary"
                                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {subs.length > 0 && (
                    <div className="grid gap-1.5">
                      <Label>
                        Sub-source <span className="text-muted-foreground font-normal">optional</span>
                      </Label>
                      <div
                        role="radiogroup"
                        aria-label="Sub-source (optional)"
                        className="flex flex-wrap gap-2"
                      >
                        {subs.map((sub) => {
                          const active = subSourceKey === sub.key;
                          return (
                            <button
                              key={sub.key}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setSubSourceKey(active ? "" : sub.key)}
                              className={cn(
                                "min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
                                active
                                  ? "border-primary/30 bg-primary/12 text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              {sub.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>

                <section className="grid gap-4">
                  <SectionLabel>Contact</SectionLabel>
                  <div className="grid gap-1.5">
                    <Label>
                      Full name <Req />
                    </Label>
                    <Input
                      className="min-h-11"
                      placeholder="e.g. Priya Sharma"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>
                      Phone <Req />
                    </Label>
                    <PhoneInput
                      value={phone}
                      onChange={(v) => setPhone(v ?? "")}
                      defaultCountry={defaultCountry}
                    />
                    {phone.length > 0 && !phoneValid && (
                      <p className="text-muted-foreground text-sm">
                        This number looks incomplete — we&apos;ll still save it.
                      </p>
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    <Label>
                      Email <Req />
                    </Label>
                    <Input
                      className="min-h-11"
                      type="email"
                      placeholder="name@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <InquiryMatch
                    phone={phone}
                    sourceKey={sourceKey}
                    pickedId={pickedId}
                    onPick={onPick}
                  />
                  {existingCustomer && (
                    <p className="text-destructive text-sm" role="alert">
                      {existingCustomer.fullName} is already a customer with this contact. Use the
                      search above to select them.
                    </p>
                  )}
                </section>
              </div>
            ) : null}

            <div className={step === 2 ? "space-y-4 px-5 py-5 sm:px-6" : "hidden"}>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-muted-foreground hover:text-foreground -ml-1 flex min-h-11 items-center gap-1 text-sm transition-colors"
              >
                ← <span className="font-medium">{fullName}</span>
              </button>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="customMealToggle" className="grid gap-0.5">
                  <span>Custom meal</span>
                  <span className="text-muted-foreground text-xs font-normal">
                    Build the tiffin item by item instead of picking a meal size.
                  </span>
                </Label>
                <Switch
                  id="customMealToggle"
                  checked={customMeal != null}
                  onCheckedChange={(on) => setCustomMeal(on ? { planKey: catalog.plans[0]?.key ?? "", items: [], basePriceOverride: null } : null)}
                />
              </div>
              {customMeal && (
                <CustomMealBuilder plans={catalog.plans} categories={categories} value={customMeal} onChange={setCustomMeal} />
              )}
              {/* Keep mounted across steps 2–3 so schedule/address aren't wiped on Edit. */}
              {step >= 2 && (
                <OrderForm
                  inquiryId=""
                  contact={{ fullName, phone, email }}
                  catalog={catalog}
                  enabledSlots={enabledSlots}
                  prefill={prefill}
                  hideMealSizePicker={customMeal != null}
                  customMeal={customMeal ? { planKey: customMeal.planKey, items: filledItems(customMeal.items), basePriceOverride: customMeal.basePriceOverride } : null}
                  paymentExtra={(methodId) => methodId === "etransfer" ? (
                    <div className="grid gap-3 rounded-lg border p-3">
                      <Label htmlFor="paidNowToggle" className="flex items-center justify-between gap-3">
                        <span className="grid gap-0.5">
                          <span>Already paid by e-Transfer</span>
                          <span className="text-muted-foreground text-xs font-normal">
                            Attach their screenshot to approve the payment and start the plan on create.
                          </span>
                        </span>
                        <Switch id="paidNowToggle" checked={paidNow} onCheckedChange={setPaidNow} />
                      </Label>
                      {paidNow && <PaymentProofField value={proof} onChange={setProof} />}
                    </div>
                  ) : null}
                  onReview={(next) => {
                    setDraft(next);
                    setCreateError(null);
                    setStep(3);
                  }}
                />
              )}
            </div>

            {step === 3 ? (
              <div className="space-y-5 px-5 py-5 sm:px-6">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-muted-foreground hover:text-foreground -ml-1 flex min-h-11 items-center gap-1 text-sm transition-colors"
                >
                  ← <span className="font-medium">Edit order</span>
                </button>

                <section className="grid gap-3">
                  <SectionLabel>Customer</SectionLabel>
                  <div className="rounded-lg border p-4 text-sm">
                    <p className="font-medium">{fullName}</p>
                    <p className="text-muted-foreground">{email.trim()}</p>
                    <p className="text-muted-foreground">{phone}</p>
                  </div>
                </section>

                <section className="grid gap-3">
                  <SectionLabel>Plan</SectionLabel>
                  <div className="space-y-2 rounded-lg border p-4 text-sm">
                    <p className="flex items-center gap-2 text-base font-semibold tracking-tight">
                      {mealLabel}
                      {trialDays != null && <TrialPill />}
                    </p>
                    {planLabel ? <p className="text-muted-foreground">{planLabel}</p> : null}
                    {customMeal && customMeal.basePriceOverride != null ? (
                      <p className="text-muted-foreground nums">
                        Staff override ${customMeal.basePriceOverride.toFixed(2)} / tiffin
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">
                      {draft?.order.selections.persons ?? 1}{" "}
                      {(draft?.order.selections.persons ?? 1) === 1 ? "person" : "persons"}
                      {trialDays != null
                        ? ` · ${trialDays} trial ${trialDays === 1 ? "day" : "days"}`
                        : ` · ${draft?.order.selections.durationWeeks ?? "—"} wk`}
                      {/* A trial is sent on the trial send days, not the plan's delivery frequency. */}
                      {frequencyLabel && trialDays == null ? ` · ${frequencyLabel}` : ""}
                    </p>
                    {eating.length > 0 && (
                      <p className="text-muted-foreground">
                        Eating {eating.map((d) => DAY_LABEL[d] ?? d).join(", ")}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      Starts {draft?.order.selections.startDate ?? "—"}
                    </p>
                    <p className="text-muted-foreground">
                      {[
                        draft?.order.contact.addressLine,
                        draft?.order.contact.city,
                        draft?.order.contact.postalCode,
                      ].filter(Boolean).join(", ")}
                    </p>
                  </div>
                </section>

                <section className="grid gap-3">
                  <SectionLabel>Price breakup</SectionLabel>
                  <OrderPricingBreakdown result={draft?.preview ?? null} currency={currency} />
                </section>

                {draft?.order.paymentMethodId ? (
                  <section className="grid gap-3">
                    <div className="flex items-center justify-between">
                      <SectionLabel>Payment</SectionLabel>
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="text-muted-foreground hover:text-foreground min-h-11 text-sm font-medium sm:min-h-0"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="rounded-lg border p-4 text-sm">
                      {paidNow && proof.file && isEtransfer ? (
                        <p>
                          e-Transfer screenshot attached
                          {proof.reference.trim() ? ` · ref ${proof.reference.trim()}` : ""} — approved on create, plan
                          starts right away.
                        </p>
                      ) : (
                        <p className="text-muted-foreground">Payment collected later with the customer payment link.</p>
                      )}
                    </div>
                  </section>
                ) : null}

                {createError ? (
                  <p className="text-destructive text-sm" role="alert">{createError}</p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </FormDrawer>

      <AdminOrderCreatedDialog
        open={successOpen}
        onOpenChange={(openSuccess) => {
          setSuccessOpen(openSuccess);
          if (!openSuccess && created) resetAndClose(false);
        }}
        result={created}
      />
    </>
  );
}
