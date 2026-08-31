"use client";

import type { Country as CountryCode } from "react-phone-number-input";
import { useEffect, useState } from "react";
import { cn } from "@foundry/ui/cn";
import dynamic from "next/dynamic";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { ResponsiveDialog } from "@foundry/design-system";
import { isValidPhone } from "@foundry/ui/phone-input";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import type { ZoneLike } from "@/lib/catalog/postal";
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
import { createOrderFlow } from "./actions";

type Src = { key: string; label: string; subs: { key: string; label: string }[] };

type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string }[];
  frequencies: { key: string; name: string }[];
  durations: { weeks: number }[];
};

type EnabledSlot = { key: string; label: string };

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
 * Two-step New order — mirrors New inquiry:
 *   1. Contact + Source (optional sub-source)
 *   2. Catalog order form (same plan/meal selects as inquiry interest)
 * Matched open inquiries prefill step 2 so convert doesn't re-ask.
 */
export function NewOrderSheet({
  trigger,
  open: controlledOpen,
  onOpenChange,
  defaultCountry,
  sources,
  catalog,
  enabledSlots,
  zones,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultCountry: CountryCode;
  sources: Src[];
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  zones: ZoneLike[];
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [step, setStep] = useState<1 | 2>(1);
  const [sourceKey, setSourceKey] = useState(sources[0]?.key ?? "manual");
  const [subSourceKey, setSubSourceKey] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [pickedCustomerId, setPickedCustomerId] = useState<string | null>(null);
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
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={resetAndClose}
      trigger={trigger}
      title="New order"
      description="Same contact + catalog plan path as inquiries — convert without re-selecting."
      contentClassName="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
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
        ) : undefined
      }
    >
      {sources.length === 0 ? (
        <NoSources noun="order" />
      ) : (
        <>
          <StepHeader step={step} steps={["Contact", "Order"]} />

          {step === 1 ? (
            <div className="space-y-6 px-5 py-5">
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
          ) : (
            <div className="space-y-4 px-5 py-5">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-muted-foreground hover:text-foreground -ml-1 flex min-h-11 items-center gap-1 text-sm transition-colors"
              >
                ← <span className="font-medium">{fullName}</span>
              </button>
              <OrderForm
                inquiryId=""
                contact={{ fullName, phone, email }}
                catalog={catalog}
                enabledSlots={enabledSlots}
                zones={zones}
                prefill={prefill}
                onCreate={(order: CreateOrderInput) =>
                  createOrderFlow({
                    source: { sourceKey, subSourceKey: subSourceKey || undefined },
                    contact: { fullName, phone, email: email.trim() },
                    interest: {
                      planInterest: order.planKey,
                      mealSizeInterest: order.selections.mealSizeId,
                      personsInterest: order.selections.persons,
                      postalCode: order.contact.postalCode,
                      preferredStart: order.selections.startDate,
                    },
                    pickedInquiryId: pickedId ?? undefined,
                    order,
                  })
                }
                onCreated={() => resetAndClose(false)}
              />
            </div>
          )}
        </>
      )}
    </ResponsiveDialog>
  );
}
