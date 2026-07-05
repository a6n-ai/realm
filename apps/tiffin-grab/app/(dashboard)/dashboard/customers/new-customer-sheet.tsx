"use client";

import { UserPlusIcon } from "lucide-react";
import type { Country as CountryCode } from "react-phone-number-input";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@realm/ui/cn";
import { Button } from "@realm/ui/button";
import dynamic from "next/dynamic";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@realm/ui/sheet";
import { isValidPhone } from "@realm/ui/phone-input";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import type { ZoneLike } from "@/lib/catalog/postal";
import { InquiryMatch } from "../_leads/inquiry-match";
import { CustomerSearch } from "../_leads/customer-search";
import { StepHeader } from "../_leads/step-header";
import type { CustomerHit } from "../_leads/match-actions";
import { NoSources } from "../_leads/no-sources";
import type { OrderFormInput } from "../inquiries/[id]/order-schema";
import { OrderForm } from "../inquiries/[id]/order/order-form";
import { createOrderFlow } from "../orders/actions";
import { createCustomerFlow } from "./actions";

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

export function NewCustomerSheet({
  trigger,
  defaultCountry,
  sources,
  catalog,
  enabledSlots,
  zones,
}: {
  trigger: React.ReactNode;
  defaultCountry: CountryCode;
  sources: Src[];
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  zones: ZoneLike[];
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [sourceKey, setSourceKey] = useState(sources[0]?.key ?? "manual");
  const [subSourceKey, setSubSourceKey] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subs = sources.find((s) => s.key === sourceKey)?.subs ?? [];
  const phoneValid = isValidPhone(phone);
  const contactReady = fullName.trim().length > 0 && phoneValid;

  function reset() {
    setStep(1);
    setSourceKey(sources[0]?.key ?? "manual");
    setSubSourceKey("");
    setFullName("");
    setPhone("");
    setEmail("");
    setPickedId(null);
    setInquiryId(null);
    setSaving(false);
    setError(null);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

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
  }

  const source = { sourceKey, subSourceKey: subSourceKey || undefined };
  const contact = { fullName, phone, email: email.trim() || undefined };

  async function onSaveOnly() {
    setError(null);
    setSaving(true);
    try {
      await createCustomerFlow({ source, contact, pickedInquiryId: pickedId ?? undefined });
      toast.success("Customer created");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create customer");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAndOrder() {
    setError(null);
    setSaving(true);
    try {
      const { inquiryId: resolvedId } = await createCustomerFlow({
        source,
        contact,
        pickedInquiryId: pickedId ?? undefined,
      });
      setInquiryId(resolvedId);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create customer");
    } finally {
      setSaving(false);
    }
  }

  const prefill: Partial<OrderFormInput> = {
    ...(email.trim() ? { email: email.trim() } : {}),
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <div className="border-border/70 flex items-start gap-3 border-b px-5 py-4">
          <span className="bg-primary/12 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
            <UserPlusIcon className="size-[18px]" />
          </span>
          <div className="grid gap-0.5">
            <SheetTitle className="text-pretty">
              {step === 1 ? "New customer" : "Add an order"}
            </SheetTitle>
            <SheetDescription>
              {step === 1
                ? "Source it, match the lead, then save the customer."
                : `Build the first order for ${fullName || "this customer"}.`}
            </SheetDescription>
          </div>
        </div>

        {sources.length > 0 && <StepHeader step={step} steps={["Customer", "Order"]} />}

        {step === 1 ? (
          <>
            {sources.length === 0 ? (
              <NoSources noun="customer" />
            ) : (
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <CustomerSearch onPick={pickCustomer} />
              {/* Source */}
              <section
                className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500"
                style={{ animationDelay: "40ms" }}
              >
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
                            // InquiryMatch re-locks if the new source has its own open match.
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
              <section
                className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500"
                style={{ animationDelay: "120ms" }}
              >
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
              </section>

              {error ? <p className="text-destructive text-sm">{error}</p> : null}
            </div>
            )}

            {sources.length > 0 && (
              <div className="border-border/70 flex items-center justify-end gap-2 border-t px-5 py-4">
                <Button variant="outline" disabled={!contactReady || saving} onClick={onSaveOnly}>
                  Save
                </Button>
                <Button disabled={!contactReady || saving} onClick={onSaveAndOrder}>
                  Save &amp; add order →
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-muted-foreground hover:text-foreground -ml-1 flex items-center gap-1 text-sm transition-colors"
            >
              ← <span className="font-medium">{fullName}</span>
            </button>
            <section
              className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500"
              style={{ animationDelay: "200ms" }}
            >
              <SectionLabel>Order</SectionLabel>
              <OrderForm
                inquiryId=""
                contact={{ fullName, phone, email }}
                catalog={catalog}
                enabledSlots={enabledSlots}
                zones={zones}
                prefill={prefill}
                onCreate={(order: CreateOrderInput) =>
                  createOrderFlow({
                    source,
                    contact,
                    pickedInquiryId: inquiryId ?? undefined,
                    order,
                  })
                }
              />
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
