"use client";

import type { Country as CountryCode } from "react-phone-number-input";
import { useState } from "react";
import { cn } from "@realm/ui/cn";
import dynamic from "next/dynamic";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { ResponsiveDialog } from "@realm/design-system";
import { isValidPhone } from "@realm/ui/phone-input";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import type { ZoneLike } from "@/lib/catalog/postal";
import { InquiryMatch } from "../_leads/inquiry-match";
import { CustomerSearch } from "../_leads/customer-search";
import { StepHeader } from "../_leads/step-header";
import { useExistingCustomer } from "../_leads/use-existing-customer";
import type { CustomerHit } from "../_leads/match-actions";
import { NoSources } from "../_leads/no-sources";
import type { OrderFormInput } from "../inquiries/[id]/order-schema";
import { OrderForm } from "../inquiries/[id]/order/order-form";
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

// Heavy (~265 flag SVGs); sheet-gated, so lazy-load behind a plain skeleton.
const PhoneInput = dynamic(() => import("@realm/ui/phone-input").then((m) => m.PhoneInput), {
  ssr: false,
  loading: () => <Input disabled placeholder="Phone" />,
});

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

  const subs = sources.find((s) => s.key === sourceKey)?.subs ?? [];
  const phoneValid = isValidPhone(phone);
  const existingCustomer = useExistingCustomer(phone, email, pickedCustomerId);
  const contactReady = fullName.trim().length > 0 && phoneValid && !existingCustomer;

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

  const prefill: Partial<OrderFormInput> = {
    ...(email.trim() ? { email: email.trim() } : {}),
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setStep(1);
      }}
      trigger={trigger}
      title="New order"
      description="Find or add the customer, then build the order."
      contentClassName="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      footer={
        sources.length > 0 && step === 1 ? (
          <div className="flex items-center justify-end gap-2">
            <Button disabled={!contactReady} onClick={() => setStep(2)} className="min-h-11 active:scale-[0.98] sm:min-h-9">
              Continue to order →
            </Button>
          </div>
        ) : undefined
      }
    >
      {sources.length === 0 ? (
        <NoSources noun="order" />
      ) : (
        <>
          <StepHeader step={step} steps={["Customer", "Order"]} />

          {step === 1 ? (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <CustomerSearch onPick={pickCustomer} />

                  {/* Source */}
                  <section className="grid gap-4">
                    <SectionLabel>Source</SectionLabel>
                    <div className="grid gap-1.5">
                      <Label>Where did they come from? <Req /></Label>
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
                                // Drop any matched inquiry — it belonged to the old source.
                                setPickedId(null);
                              }}
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]",
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
                        <Label>Sub-source <span className="text-muted-foreground font-normal">optional</span></Label>
                        <Select value={subSourceKey} onValueChange={setSubSourceKey}>
                          <SelectTrigger><SelectValue placeholder="Select sub-source" /></SelectTrigger>
                          <SelectContent>
                            {subs.map((sub) => (
                              <SelectItem key={sub.key} value={sub.key}>{sub.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </section>

                  {/* Contact */}
                  <section className="grid gap-4">
                    <SectionLabel>Contact</SectionLabel>
                    <div className="grid gap-1.5">
                      <Label>Full name <Req /></Label>
                      <Input placeholder="e.g. Priya Sharma" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Phone <Req /></Label>
                      <PhoneInput value={phone} onChange={(v) => setPhone(v ?? "")} defaultCountry={defaultCountry} />
                      {phone.length > 0 && !phoneValid && (
                        <p className="text-destructive text-sm">Enter a valid phone number</p>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Email <span className="text-muted-foreground font-normal">optional</span></Label>
                      <Input type="email" placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <InquiryMatch phone={phone} sourceKey={sourceKey} pickedId={pickedId} onPick={onPick} />
                    {existingCustomer && (
                      <p className="text-destructive text-sm">
                        {existingCustomer.fullName} is already a customer with this contact. Use the search above to select them.
                      </p>
                    )}
                  </section>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-muted-foreground hover:text-foreground -ml-1 flex items-center gap-1 text-sm transition-colors"
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
                    contact: { fullName, phone, email: email.trim() || undefined },
                    pickedInquiryId: pickedId ?? undefined,
                    order,
                  })
                }
              />
            </div>
          )}
        </>
      )}
    </ResponsiveDialog>
  );
}
