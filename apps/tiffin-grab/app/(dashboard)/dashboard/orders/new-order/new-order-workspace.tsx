"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Country as CountryCode } from "react-phone-number-input";
import { isValidPhoneNumber as isValidPhone } from "libphonenumber-js";
import { CalendarDaysIcon, CheckIcon, ChevronDownIcon, CopyIcon, Loader2Icon, MinusIcon, PlusIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { estimatePrefill, renewPrefill } from "../../discounts/estimate-actions";
import { toast } from "sonner";
import { emailSchema, weekdayKey } from "@foundry/commons";
import { appToday } from "@/lib/services/start-date";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { Switch } from "@foundry/ui/switch";
import { AddressFields } from "@foundry/ui/address-fields";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@foundry/ui/command";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/reui/stepper";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toggleVariants } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DateInput } from "@/components/dashboard/date-fields";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@foundry/ui/card";
import { DeliveryAreaNote } from "@/components/customer/address/delivery-area";
import { ScheduleCard } from "@/components/wizard/schedule-card";
import { makeImageThumbnail } from "@/components/ds";
import { discountLine } from "@/components/customer/home/coupons-section";
import { unwrapAction } from "@/lib/actions/unwrap";
import { dropOffSummary } from "@/lib/catalog/drop-off";
import { allowedDaysError, dayAllowed, eatingDaysError, onlyOnMessage, type DayOfWeek } from "@/lib/menu/delivery-days";
import { toggleTrialPick } from "@/lib/trial/schedule";
import type { CheckoutPaymentMethod } from "@/app/(public)/subscribe/actions";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import type { OrderFormInput } from "../../inquiries/[id]/order-schema";
import { useOrderDraft } from "../../inquiries/[id]/order/use-order-draft";
import { dayBeforeIso, round2, type Catalog } from "../../inquiries/[id]/order/order-draft";
import { interestToPrefill } from "../../inquiries/_leads/interest-prefill";
import { CustomerSearch } from "../../_leads/customer-search";
import { InquiryMatch } from "../../_leads/inquiry-match";
import { NoSources } from "../../_leads/no-sources";
import { useExistingCustomer } from "../../_leads/use-existing-customer";
import { getInquiryInterestForPrefill, type CustomerHit } from "../../_leads/match-actions";
import { CustomerCodeField } from "../../discounts/customer-code-field";
import { CoinsField } from "../../discounts/coins-field";
import { OrderPricingBreakdown } from "../[id]/order-pricing-breakdown";
import { AdminOrderCreatedPanel, type AdminOrderCreated } from "../admin-order-created-dialog";
import { CreatedOrderDetails, createdOrderFacts, whatsAppOrderMessage } from "./created-order-details";
import { createOrderFlow, saveOrderLeadAction, settleNewOrderWithProofAction } from "../actions";
import { PaymentProofField, type PaymentProofValue } from "../payment-proof-field";
import { FormDrawer } from "../form-drawer";
import { DropOffToggles } from "./drop-off-toggles";

type Src = { key: string; label: string; subs: { key: string; label: string }[] };
type Props = {
  /** Renders the sheet's own trigger button; omit when the sheet is opened by `open`. */
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultCountry: CountryCode;
  sources: Src[];
  catalog: Catalog;
  categories: { key: string; label: string }[];
  currency?: string;
};

const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const dayName = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);
const APP_NAME = "Tiffin Grab";
const STEPS = ["Order", "Delivery & payment"] as const;

const PhoneInput = dynamic(() => import("@foundry/ui/phone-input").then((m) => m.PhoneInput), {
  ssr: false,
  loading: () => <Input disabled placeholder="Phone" />,
});

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, error, children }: { label: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label>{label}</Label>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      {children}
      {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function chargeHint(item: { chargeType: "none" | "fixed" | "percent"; chargeValue: number }): string {
  if (item.chargeType === "none" || item.chargeValue === 0) return "Free";
  return item.chargeType === "fixed" ? `+$${item.chargeValue.toFixed(2)}` : `+${item.chargeValue}%`;
}

/** New order: one scrolling column and a pinned bar with the total and Create. */
export function NewOrderWorkspace({ triggerLabel, open: controlledOpen, onOpenChange, ...rest }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bumping the key remounts the body, which clears every field for "New order".
  const [run, setRun] = useState(0);
  const router = useRouter();
  // Something was saved while the sheet was open (lead, order); the page refreshes once it closes.
  // Refreshing while open would remount the sheet inside the Orders page's Suspense boundary (see createOrderFlow).
  const savedSinceOpen = useRef(false);
  const open = controlledOpen ?? internalOpen;
  const setOpenRaw = onOpenChange ?? setInternalOpen;
  const setOpen = (o: boolean) => {
    setOpenRaw(o);
    if (!o && savedSinceOpen.current) {
      savedSinceOpen.current = false;
      router.refresh();
    }
  };

  return (
    <FormDrawer
      flush
      open={open}
      onOpenChange={(o) => { if (!busy) setOpen(o); }}
      trigger={triggerLabel ? <Button><PlusIcon />{triggerLabel}</Button> : undefined}
      title="New order"
    >
      {rest.sources.length === 0 ? (
        <div className="px-5 py-4"><NoSources noun="order" /></div>
      ) : (
        <WorkspaceBody key={run} {...rest} setBusy={setBusy} onClose={() => setOpen(false)} onNew={() => setRun((n) => n + 1)} onSaved={() => { savedSinceOpen.current = true; }} />
      )}
    </FormDrawer>
  );
}

function WorkspaceBody({
  defaultCountry, sources, catalog, categories, currency = "CAD", setBusy, onClose, onNew,
  onSaved,
}: Omit<Props, "triggerLabel" | "open" | "onOpenChange"> & { setBusy: (b: boolean) => void; onClose: () => void; onNew: () => void; onSaved: () => void }) {
  const router = useRouter();
  const enabledSlots = categories.map((c) => ({ key: c.key, label: c.label }));

  const [sourceKey, setSourceKey] = useState(sources[0]?.key ?? "manual");
  const [subSourceKey, setSubSourceKey] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [pickedCustomerId, setPickedCustomerId] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  // The running plan this order was filled from, shown as the selected pill.
  const [renewedFrom, setRenewedFrom] = useState<string | null>(null);
  const [addonPickerOpen, setAddonPickerOpen] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [fetchedPrefill, setFetchedPrefill] = useState<{ forId: string; prefill: Partial<OrderFormInput> } | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [paidNow, setPaidNow] = useState(false);
  const [proof, setProof] = useState<PaymentProofValue>({ file: null, reference: "" });
  const [contactError, setContactError] = useState<string | null>(null);
  const leadSaving = useRef(false);
  const [step, setStep] = useState<1 | 2>(1);
  // The order as sent, for the recap shown after create.
  const [createdOrder, setCreatedOrder] = useState<CreateOrderInput | null>(null);

  const subs = sources.find((s) => s.key === sourceKey)?.subs ?? [];
  const phoneValid = isValidPhone(phone);
  const emailError = email.trim() ? emailSchema.safeParse(email).error?.issues[0]?.message ?? null : null;
  const existingCustomer = useExistingCustomer(phone, email, pickedCustomerId);
  const contactReady = fullName.trim().length > 0 && phone.trim().length > 0 && email.trim().length > 0 && !emailError && !existingCustomer;

  async function createOrder(order: CreateOrderInput): Promise<AdminOrderCreated> {
    setBusy(true);
    setStage("Creating customer and order…");
    try {
      const result = await unwrapAction(createOrderFlow({
        source: { sourceKey, subSourceKey: subSourceKey || undefined },
        contact: { fullName, phone, email: email.trim() },
        interest: {
          planInterest: order.planKey || undefined,
          mealSizeInterest: order.selections.mealSizeId,
          personsInterest: order.selections.persons,
          frequencyKeyInterest: order.selections.frequencyKey,
          eatingDaysInterest: order.selections.eatingDays,
          postalCode: order.contact.postalCode,
          preferredStart: order.selections.startDate,
        },
        pickedInquiryId: pickedId ?? leadId ?? undefined,
        order,
        revalidate: false,
      }));
      onSaved();
      let paid: AdminOrderCreated["paid"];
      if (paidNow && proof.file) {
        // The order exists already; a failed upload is reported on the result, not thrown.
        setStage("Saving screenshot and approving payment…");
        const form = new FormData();
        const thumb = await makeImageThumbnail(proof.file);
        form.set("proof", proof.file);
        form.set("proof_thumb", thumb, thumb.name);
        if (proof.reference.trim()) form.set("reference", proof.reference.trim());
        const settled = await settleNewOrderWithProofAction(result.publicId, form);
        paid = "error" in settled ? { ok: false, error: settled.error } : { ok: true };
      }
      setCreatedOrder(order);
      return { ...result, paid };
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  const d = useOrderDraft({
    inquiryId: "",
    contact: { fullName, phone, email },
    catalog,
    enabledSlots,
    hasSummary: false,
    page: step === 1 ? "order" : "payment",
    onContinue: () => setStep(2),
    onCreate: createOrder,
  });
  const { form, submitting, error, customerCtx, deliveryOptions, planKey, mealSizeId, frequencyKey, eatingDays, startDate, addressLine, city, postalCode, bounds, sizeDays, isTrial, deliveryFrequencies, durations, eligibleAddons, shownPreview, previewError, created } = d;

  // A picked customer with running plans starts from the latest one (the plan they would renew),
  // once per customer and only on an untouched plan, so it never overwrites what staff chose.
  const autoRenewedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!pickedCustomerId || autoRenewedFor.current === pickedCustomerId || customerCtx.plans.length === 0 || mealSizeId) return;
    autoRenewedFor.current = pickedCustomerId;
    const latest = customerCtx.plans.reduce((a, b) => (b.lastDay > a.lastDay ? b : a));
    void renewFrom(latest.publicId, latest.deploymentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedCustomerId, customerCtx.plans]);
  const errors = form.formState.errors;

  // The hook reads the email from the form, not from props.
  useEffect(() => {
    form.setValue("email", email.trim(), { shouldValidate: emailTouched });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  useEffect(() => {
    if (!pickedId) return;
    let cancelled = false;
    getInquiryInterestForPrefill(pickedId)
      .then((interest) => {
        if (cancelled) return;
        setFetchedPrefill({ forId: pickedId, prefill: interestToPrefill(interest, { plans: catalog.plans, mealSizes: catalog.mealSizes }).prefill });
      })
      .catch(() => { if (!cancelled) setFetchedPrefill({ forId: pickedId, prefill: {} }); });
    return () => { cancelled = true; };
  }, [pickedId, catalog.plans, catalog.mealSizes]);

  useEffect(() => {
    if (!pickedId || fetchedPrefill?.forId !== pickedId) return;
    for (const [k, v] of Object.entries(fetchedPrefill.prefill)) {
      if (v !== undefined && k !== "email") form.setValue(k as keyof OrderFormInput, v as never, { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedPrefill]);

  // Save the lead once the contact is complete and has stopped changing, so an abandoned order still leaves an inquiry.
  useEffect(() => {
    if (leadId || leadSaving.current || !contactReady) return;
    const t = setTimeout(() => {
      leadSaving.current = true;
      unwrapAction(saveOrderLeadAction({
        source: { sourceKey, subSourceKey: subSourceKey || undefined },
        contact: { fullName, phone, email: email.trim() },
        pickedInquiryId: pickedId ?? undefined,
        revalidate: false,
      }))
        .then(({ inquiryId }) => { setLeadId(inquiryId); onSaved(); })
        .catch(() => {})
        .finally(() => { leadSaving.current = false; });
    }, 1500);
    return () => clearTimeout(t);
  }, [leadId, contactReady, fullName, phone, email, sourceKey, subSourceKey, pickedId]);

  async function renewFrom(orderPublicId: string, deploymentId: string) {
    setRenewing(true);
    setRenewingId(orderPublicId);
    const r = await estimatePrefill(orderPublicId).catch(() => ({ error: "Couldn't load that plan" }));
    setRenewing(false);
    setRenewingId(null);
    if ("error" in r) return toast.error(r.error);
    d.applyPrefill(r.prefill, r.addressPublicId);
    setRenewedFrom(orderPublicId);
    toast.success(`Filled from ${deploymentId}`);
  }

  async function renewLast(customerPublicId: string) {
    setRenewing(true);
    const r = await renewPrefill(customerPublicId).catch(() => ({ error: "Couldn't load their last plan" }));
    setRenewing(false);
    if ("error" in r) return toast.error(r.error);
    d.applyPrefill(r.prefill, r.addressPublicId);
    toast.success(`Filled from ${r.deploymentId}`);
  }

  function pickCustomer(c: CustomerHit) {
    setFullName(c.fullName ?? "");
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setPickedCustomerId(c.publicId);
  }

  const meals = planKey ? catalog.mealSizes.filter((m) => m.diet === planKey) : [];
  function pickPlan(key: string) {
    form.setValue("planKey", key, { shouldDirty: true, shouldValidate: true });
    const next = catalog.mealSizes.filter((m) => m.diet === key);
    if (!next.some((m) => m.id === mealSizeId)) form.setValue("mealSizeId", next[0]?.id ?? "", { shouldDirty: true, shouldValidate: true });
  }

  const deliveryDays = (deliveryFrequencies.find((f) => f.key === frequencyKey)?.weekdays ?? []) as DayOfWeek[];
  const enough = eatingDays.length >= bounds.min;
  const eatingError = enough ? (eatingDaysError(deliveryDays, eatingDays, bounds) ?? allowedDaysError(eatingDays, sizeDays)) : `Pick ${bounds.min} to ${bounds.max} eating days a week.`;

  const savedAddress = d.addressPublicId != null;
  const addressTags = deliveryOptions?.deliveryCharges?.addressTags ?? [];
  const tagName = addressTags.find((t) => t.id === d.addressTagId)?.name;
  const extrasSummary = [tagName, dropOffSummary(d.dropOffs, d.dropOff), d.notes.trim() && `"${d.notes.trim().slice(0, 30)}"`].filter(Boolean).join(" · ") || "None set";

  const selectedMethod = d.paymentMethods.find((m) => m.id === d.paymentMethodId);
  async function copyPaymentDetails(m: CheckoutPaymentMethod) {
    const amount = shownPreview ? `$${shownPreview.total.toFixed(2)}` : "the order total";
    const lines = [
      `Hi ${fullName.split(" ")[0] || "there"}, your ${APP_NAME} order total is ${amount}.`,
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

  const { coupons, couponCodes, repInfo, discount } = d;
  const discountCount = (coupons?.applied.length ?? 0) + (discount > 0 ? 1 : 0) + ((d.coinPreview?.used ?? 0) > 0 ? 1 : 0);
  const savedTotal = (shownPreview?.adjustments ?? []).reduce((sum, a) => sum + a.amount, 0);

  const contactMissing = [!fullName.trim() && "name", !phone.trim() && "phone", (!email.trim() || !!emailError) && "valid email", !sourceKey && "source"].filter(Boolean) as string[];
  const missing = [...contactMissing, ...d.missing];
  const mealLabel = catalog.mealSizes.find((m) => m.id === mealSizeId)?.name;

  function goContinue() {
    if (existingCustomer) return setContactError(`${existingCustomer.fullName} is already a customer with this contact. Use the search to select them.`);
    if (contactMissing.length) return setContactError(`Customer: ${contactMissing.join(", ")} needed`);
    setContactError(null);
    void d.continueToPayment();
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (existingCustomer) return setContactError(`${existingCustomer.fullName} is already a customer with this contact. Use the search to select them.`);
    if (contactMissing.length) return setContactError(`Customer: ${contactMissing.join(", ")} needed`);
    setContactError(null);
    void d.onSubmit(e);
  }

  if (created) {
    const facts = createdOrder
      ? createdOrderFacts(
          created.deploymentId,
          createdOrder,
          catalog,
          d.paymentMethods.find((m) => m.id === createdOrder.paymentMethodId)?.label ?? null,
          Object.fromEntries(eligibleAddons.map((a) => [a.key, a.name])),
        )
      : null;
    return (
      <div className="grid gap-6 px-5 py-4">
        <AdminOrderCreatedPanel
          key={created.publicId}
          result={created}
          heading
          whatsappText={facts ? (payUrl) => whatsAppOrderMessage(facts, shownPreview, payUrl) : undefined}
        />
        {facts && <CreatedOrderDetails facts={facts} preview={shownPreview} currency={currency} />}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onNew}>New order</Button>
          <Button onClick={() => { onClose(); router.push(`/dashboard/orders/${created.publicId}`); }}>View order</Button>
        </div>
      </div>
    );
  }

  // The next three days this plan can start (cutoff, renewal, trial and weekend rules all apply),
  // named Today/Tomorrow/Day after when they are, else by date. A fixed "today/tomorrow" set would be
  // all-disabled from Friday to Sunday.
  const calendarToday = appToday(catalog.timezone).toISOString().slice(0, 10);
  const relative = ["Today", "Tomorrow", "Day after"];
  const quickStarts: { iso: string; label: string }[] = [];
  for (let n = 0, day = new Date(`${d.minStart}T00:00:00Z`); n < 21 && quickStarts.length < 3; n++, day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = weekdayKey(day) as DayOfWeek;
    const startable = d.isTrial ? d.trialWeekdays.includes(weekday) : day.getUTCDay() !== 0 && day.getUTCDay() !== 6;
    if (!startable) continue;
    const iso = day.toISOString().slice(0, 10);
    const offset = Math.round((Date.parse(iso) - Date.parse(calendarToday)) / 86_400_000);
    const label = relative[offset] ?? day.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    quickStarts.push({ iso, label });
  }

  return (
    <form onSubmit={submit} className="relative flex flex-1 flex-col">
      {submitting && (
        <div role="status" aria-live="polite" className="bg-background/85 absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
          <Loader2Icon className="text-primary size-8 animate-spin" />
          <p className="text-sm font-medium">{stage ?? "Creating order…"}</p>
          <p className="text-muted-foreground text-xs">Saving everything. Keep this open.</p>
        </div>
      )}

      <div className="border-b px-5 py-3">
        <Stepper value={step} onValueChange={(v) => { if (v < step && !submitting) setStep(v as 1 | 2); }} indicators={{ completed: <CheckIcon className="size-3.5" aria-hidden /> }}>
          <StepperNav>
            {STEPS.map((label, i) => (
              <StepperItem key={label} step={i + 1} completed={step > i + 1} className="flex-1">
                <StepperTrigger className="gap-2">
                  <StepperIndicator>{i + 1}</StepperIndicator>
                  <StepperTitle>{label}</StepperTitle>
                </StepperTrigger>
                {i < STEPS.length - 1 && <StepperSeparator className="mx-2" />}
              </StepperItem>
            ))}
          </StepperNav>
        </Stepper>
      </div>

      {/* Both pages stay mounted so nothing typed is lost when switching. */}
      <div className="flex flex-col gap-6 px-5 pt-4 pb-6">
        <div className={step === 1 ? "flex flex-col gap-6" : "hidden"}>
        <Section title="Customer">
          {/* Matched inquiries sit beside the search: both answer "is this someone we already know?". */}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1"><CustomerSearch onPick={pickCustomer} /></div>
            <InquiryMatch compact phone={phone} sourceKey={sourceKey} pickedId={pickedId} onPick={(id, locked) => { setPickedId(id); if (id && locked) { setSourceKey(locked); setSubSourceKey(""); } }} />
          </div>
          <Field label="Full name">
            <Input placeholder="e.g. Priya Sharma" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" error={phone.length > 0 && !phoneValid ? "This number looks incomplete. We'll still save it." : null}>
              <PhoneInput className="[&_button]:rounded-s-lg [&_input]:rounded-e-lg" value={phone} onChange={(v) => setPhone(v ?? "")} defaultCountry={defaultCountry} />
            </Field>
            <Field label="Email" error={emailTouched ? emailError : null}>
              <Input type="email" placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setEmailTouched(true)} aria-invalid={emailTouched && !!emailError} />
            </Field>
          </div>
          <Field label="Source">
            <ToggleGroup type="single" variant="outline" size="default" spacing={2} className="flex-wrap" value={sourceKey}
              onValueChange={(v) => { if (!v) return; setSourceKey(v); setSubSourceKey(""); setPickedId(null); }}>
              {sources.map((s) => <ToggleGroupItem key={s.key} value={s.key}>{s.label}</ToggleGroupItem>)}
            </ToggleGroup>
          </Field>
          {subs.length > 0 && (
            <Field label="Sub-source" hint="optional">
              <ToggleGroup type="single" variant="outline" size="default" spacing={2} className="flex-wrap" value={subSourceKey} onValueChange={setSubSourceKey}>
                {subs.map((s) => <ToggleGroupItem key={s.key} value={s.key}>{s.label}</ToggleGroupItem>)}
              </ToggleGroup>
            </Field>
          )}
          {existingCustomer && (
            <Alert variant="destructive"><AlertDescription>{existingCustomer.fullName} is already a customer with this contact. Use the search above to select them.</AlertDescription></Alert>
          )}
          {customerCtx.conflict && (
            <Alert variant="destructive"><AlertDescription>This phone number and this email belong to two different customers. Correct one of them before creating the order.</AlertDescription></Alert>
          )}
          {customerCtx.plans.length > 0 ? (
            // Each running plan is a pill: tap one to start the new order from it (meal, schedule, add-ons, address).
            <Field label="Running plans" hint="Tap one to renew it">
              <TooltipProvider delayDuration={300}>
                <div className="flex flex-wrap gap-2">
                  {customerCtx.plans.map((p) => (
                    <button
                      key={p.publicId}
                      type="button"
                      disabled={renewing}
                      data-state={renewedFrom === p.publicId ? "on" : "off"}
                      onClick={() => void renewFrom(p.publicId, p.deploymentId)}
                      className={toggleVariants({ variant: "outline", className: "max-w-full" })}
                    >
                      <RefreshCwIcon className={renewing && renewingId === p.publicId ? "animate-spin" : undefined} />
                      {/* Tooltip on the label: on the button its trigger would overwrite data-state. */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="tabular-nums">{p.deploymentId}</span>
                            <span className="text-muted-foreground truncate font-normal">· ends {p.lastDay}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{p.mealSize} · <span className="capitalize">{p.status}</span> · {p.startDate} to {p.lastDay} · {p.tiffinCount} tiffins</TooltipContent>
                      </Tooltip>
                    </button>
                  ))}
                </div>
              </TooltipProvider>
            </Field>
          ) : pickedCustomerId && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs text-pretty">Same meal, schedule, add-ons and address as their last plan.</p>
              <Button type="button" variant="outline" disabled={renewing} onClick={() => void renewLast(pickedCustomerId)}>
                {renewing ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Renew last plan
              </Button>
            </div>
          )}
        </Section>

        <Section title="Plan" hint={isTrial ? `${d.multiDayTrial ? "Pick the days the trial arrives" : "A one-day trial arrives on its start date"}${d.trialFrequencyName ? ` · ${d.trialFrequencyName}` : ""}.` : undefined}>
          <Field label="Diet">
            <ToggleGroup type="single" variant="outline" size="default" spacing={2} className="flex-wrap" value={planKey} onValueChange={(v) => v && pickPlan(v)}>
              {catalog.plans.map((p) => <ToggleGroupItem key={p.key} value={p.key}>{p.name}</ToggleGroupItem>)}
            </ToggleGroup>
          </Field>
          {planKey && (
            <Field label="Meal size" error={meals.length === 0 ? "No meal sizes for this plan." : null}>
              {/* Equal cells keep the grid even; long names are cut and shown in full on hover. */}
              <TooltipProvider delayDuration={300}>
                <ToggleGroup type="single" variant="outline" size="default" spacing={2} className="grid w-full grid-cols-3" value={mealSizeId}
                  onValueChange={(v) => v && form.setValue("mealSizeId", v, { shouldDirty: true, shouldValidate: true })}>
                  {meals.map((m) => {
                    const label = m.trial ? `${m.name} · Trial` : m.name;
                    return (
                      // Tooltip wraps the label, not the item: its trigger sets data-state, which would hide the item's "on" style.
                      <ToggleGroupItem key={m.id} value={m.id} aria-label={label}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="truncate">{label}</span>
                          </TooltipTrigger>
                          <TooltipContent>{label}</TooltipContent>
                        </Tooltip>
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </TooltipProvider>
            </Field>
          )}
          {eligibleAddons.length > 0 && (
            <Field label="Add-ons">
              <div className="flex flex-wrap items-center gap-2">
                {/* Searchable list: production menus have many add-ons. Picked ones leave the list and line up beside the button. */}
                <Popover open={addonPickerOpen} onOpenChange={setAddonPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" disabled={eligibleAddons.every((a) => d.qtyFor(a.key) > 0)}><PlusIcon /> Add-on</Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-0">
                    <Command>
                      <CommandInput placeholder="Find an add-on…" />
                      <CommandList>
                        <CommandEmpty>No add-ons.</CommandEmpty>
                        <CommandGroup>
                          {eligibleAddons.filter((a) => d.qtyFor(a.key) === 0).map((a) => (
                            <CommandItem key={a.key} value={a.name} onSelect={() => { d.setAddonQty(a.key, 1); setAddonPickerOpen(false); }}>
                              <span className="flex-1">{a.name}</span>
                              <span className="text-muted-foreground tabular-nums">${a.pricePerTiffin.toFixed(2)}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {eligibleAddons.filter((a) => d.qtyFor(a.key) > 0).map((a) => {
                  const qty = d.qtyFor(a.key);
                  return (
                    // Same box as a selected ToggleGroup pill, so picked add-ons read as choices, not tags.
                    <span key={a.key} role="group" aria-label={`${a.name} quantity`} data-state="on" className={toggleVariants({ variant: "outline", className: "gap-1 pr-1" })} title={a.portion ?? undefined}>
                      {a.name}
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove one ${a.name}`} onClick={() => d.setAddonQty(a.key, qty - 1)}>{qty > 1 ? <MinusIcon /> : <XIcon />}</Button>
                      <span className="w-3 text-center tabular-nums" aria-live="polite">{qty}</span>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Add one ${a.name}`} disabled={qty >= a.maxQty} onClick={() => d.setAddonQty(a.key, qty + 1)}><PlusIcon /></Button>
                    </span>
                  );
                })}
              </div>
            </Field>
          )}
          {!isTrial && (
            <Field label="Duration">
              {/* One row, equal cells: each length shows what it saves, so staff can upsell a longer plan. */}
              <ToggleGroup type="single" variant="outline" size="default" spacing={2} className="w-full" value={String(form.watch("durationWeeks"))}
                onValueChange={(v) => v && form.setValue("durationWeeks", Number(v), { shouldDirty: true, shouldValidate: true })}>
                {durations.map((x) => (
                  <ToggleGroupItem key={x.weeks} value={String(x.weeks)} className="min-w-0 flex-1 gap-1 px-2 tabular-nums">
                    {x.weeks} wk
                    {!!x.savePct && <span className="text-primary text-xs">−{x.savePct}%</span>}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          )}
          <Field label="Start date" error={errors.startDate?.message}>
            <div className="flex flex-wrap items-center gap-2">
              <DateInput min={d.minStart} value={startDate} onChange={(v) => form.setValue("startDate", v, { shouldDirty: true, shouldValidate: true })} className="min-w-0 flex-1" />
              {/* Quick picks: the next three valid start days. */}
              <ToggleGroup type="single" variant="outline" size="default" spacing={2} value={startDate}
                onValueChange={(v) => v && form.setValue("startDate", v, { shouldDirty: true, shouldValidate: true })}>
                {quickStarts.map((q) => (
                  <ToggleGroupItem key={q.iso} value={q.iso}>
                    {q.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {d.renewalBound && (
              <p className="text-muted-foreground text-xs text-pretty">
                Renewal: current plan runs through {dayBeforeIso(d.renewFrom!)}. The new plan starts on or after{" "}
                <button type="button" className="text-primary font-medium underline-offset-2 hover:underline" onClick={() => form.setValue("startDate", d.renewalStart!, { shouldDirty: true, shouldValidate: true })}>
                  {d.renewalStart}
                </button>.
              </p>
            )}
          </Field>

          {isTrial ? (
            <>
              {d.trialOpen && d.multiDayTrial && (
                <Field label="Trial days" hint={`${d.pickedDays.length} of ${d.trialMax} days`}>
                  <ToggleGroup type="multiple" variant="outline" size="default" spacing={1} className="w-full" value={d.pickedDays}
                    onValueChange={(next) => {
                      const changed = DAYS.find((x) => next.includes(x) !== d.pickedDays.includes(x));
                      if (changed) d.setPickedDays((prev) => toggleTrialPick(prev, changed, d.trialWeekdays, d.trialMax) as DayOfWeek[]);
                    }}>
                    {DAYS.map((x) => (
                      <ToggleGroupItem key={x} value={x} className="flex-1" disabled={!d.pickedDays.includes(x) && (!d.trialWeekdays.includes(x) || d.pickedDays.length >= d.trialMax)}>{dayName(x)}</ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              )}
              {!(d.trialOpen && startDate && d.trialStartOk) && (
                <p className={`text-xs text-pretty ${d.trialOpen && startDate ? "text-destructive" : "text-muted-foreground"}`}>
                  {!d.trialOpen
                    ? "Set a max and send days on Meal sizes → Trial before creating a trial order."
                    : !startDate
                      ? `Trials go out ${d.trialWeekdays.map(dayName).join(", ")}. Pick a start date.`
                      : `Start on ${(d.multiDayTrial ? d.pickedDays : d.trialWeekdays).map(dayName).join(" or ")}.`}
                </p>
              )}
            </>
          ) : (
            <>
              <Field label="Delivery days">
                <ToggleGroup type="single" variant="outline" size="default" spacing={2} className="flex-wrap" value={frequencyKey}
                  onValueChange={(v) => v && form.setValue("frequencyKey", v, { shouldDirty: true, shouldValidate: true })}>
                  {deliveryFrequencies.map((f) => (
                    <ToggleGroupItem key={f.key} value={f.key} title={(f.weekdays ?? []).map(dayName).join(" · ")}>
                      {f.name}
                      {!!f.savePct && <span className="text-primary text-xs tabular-nums">Save {f.savePct}%</span>}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <Field
                label="Eating days"
                hint={`${eatingDays.length} ${eatingDays.length === 1 ? "tiffin" : "tiffins"} a week · ${bounds.min} to ${bounds.max}`}
                error={eatingError}
              >
                <ToggleGroup type="multiple" variant="outline" size="default" spacing={1} className="w-full" value={eatingDays}
                  onValueChange={(next) => {
                    const changed = DAYS.find((x) => next.includes(x) !== eatingDays.includes(x));
                    if (changed) d.toggleEating(changed);
                  }}>
                  {DAYS.map((x) => (
                    <ToggleGroupItem key={x} value={x} className="flex-1" disabled={!eatingDays.includes(x) && (eatingDays.length >= bounds.max || !dayAllowed(x, sizeDays))}>{dayName(x)}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {sizeDays?.length ? <p className="text-muted-foreground text-xs">{onlyOnMessage(sizeDays)}.</p> : null}
              </Field>
            </>
          )}

          {d.schedule && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="justify-self-start">
                  <CalendarDaysIcon /> {d.schedule.trips.length} {d.schedule.trips.length === 1 ? "delivery" : "deliveries"} · show calendar
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <ScheduleCard trips={d.schedule.trips} shifted={d.schedule.shifted} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </Section>

        </div>

        <div className={step === 2 ? "flex flex-col gap-6" : "hidden"}>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="truncate">{fullName || "Customer"}</CardTitle>
            <CardDescription className="truncate">
              {[catalog.plans.find((p) => p.key === planKey)?.name, mealLabel, isTrial ? "Trial" : `${form.watch("durationWeeks")} wk`, startDate && `from ${startDate}`].filter(Boolean).join(" · ")}
            </CardDescription>
            <CardAction>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>Edit</Button>
            </CardAction>
          </CardHeader>
        </Card>
        <Section title="Address">
          {customerCtx.addresses.length > 0 && (
            <RadioGroup value={d.addressPublicId ?? "new"} onValueChange={(v) => d.pickSavedAddress(v === "new" ? null : v)} aria-label="Saved addresses">
              {customerCtx.addresses.map((a) => (
                <Label key={a.publicId} className="flex items-start gap-2 rounded-lg border p-2.5 font-normal">
                  <RadioGroupItem value={a.publicId} className="mt-0.5" />
                  <span className="grid gap-0.5 text-sm">
                    <span className="font-medium">{a.label}{a.isDefault ? <span className="text-muted-foreground font-normal"> · Default</span> : null}</span>
                    <span className="text-muted-foreground text-xs">{[a.addressUnit, a.addressLine, a.city, a.postalCode].filter(Boolean).join(", ")}</span>
                  </span>
                </Label>
              ))}
              <Label className="flex items-center gap-2 rounded-lg border p-2.5 font-normal">
                <RadioGroupItem value="new" />
                <span className="text-sm font-medium">New address</span>
              </Label>
            </RadioGroup>
          )}
          {/* A picked saved address is shown in its card above; the fields are only for typing a new one. */}
          {!savedAddress && <fieldset className="grid gap-2">
            <AddressFields
              idPrefix="order"
              fields={["addressLine", "city", "postalCode"]}
              values={{ addressLine, city, postalCode }}
              onChange={(patch) => {
                for (const key of ["addressLine", "city", "postalCode"] as const) {
                  if (patch[key] !== undefined) form.setValue(key, patch[key], { shouldDirty: true, shouldValidate: true });
                }
              }}
              errors={{ addressLine: errors.addressLine?.message, city: errors.city?.message, postalCode: errors.postalCode?.message }}
              resolveUrl="/api/address/resolve"
            />
          </fieldset>}
          <DeliveryAreaNote area={d.deliveryArea} />
          <Collapsible className="grid gap-3">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="justify-between">
                <span>Delivery extras <span className="text-muted-foreground font-normal">· {extrasSummary}</span></span>
                <ChevronDownIcon />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-3">
              {addressTags.length > 0 && (
                <Field label="Address type">
                  <ToggleGroup type="single" variant="outline" size="default" spacing={2} className="flex-wrap" value={d.addressTagId ?? ""} onValueChange={(v) => d.setAddressTagId(v || null)}>
                    {addressTags.map((t) => (
                      <ToggleGroupItem key={t.id} value={t.id}>{t.name}<span className="text-muted-foreground text-xs">{chargeHint(t)}</span></ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              )}
              <DropOffToggles catalog={d.dropOffs} value={d.dropOff} onChange={d.setDropOff} disabled={submitting} />
              <Field label="Delivery notes" hint={savedAddress ? "From the saved address" : undefined}>
                <Textarea value={d.notes} onChange={(e) => d.setNotes(e.target.value)} disabled={savedAddress} placeholder="Buzzer code, leave at door, call on arrival…" rows={2} maxLength={500} />
              </Field>
            </CollapsibleContent>
          </Collapsible>
        </Section>

        <Section title="Payment">
          {d.realPayments ? (
            <>
              <ToggleGroup type="single" variant="outline" size="default" spacing={2} className="flex-wrap" value={d.paymentMethodId ?? ""} onValueChange={(v) => v && d.setPaymentMethodId(v)}>
                {d.paymentMethods.map((m) => <ToggleGroupItem key={m.id} value={m.id}>{m.label}</ToggleGroupItem>)}
              </ToggleGroup>
              {selectedMethod && (
                // One line per method: who to pay and a copy button. The full instructions travel in the copied text.
                selectedMethod.payeeHandle || selectedMethod.instructions?.trim() ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground min-w-0 truncate text-xs" title={selectedMethod.instructions ?? undefined}>
                      {selectedMethod.payeeHandle ? <>Send to <span className="text-foreground font-medium">{selectedMethod.payeeHandle}</span></> : selectedMethod.instructions}
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => void copyPaymentDetails(selectedMethod)}>
                      <CopyIcon /> Copy details
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs text-pretty">Copy or email the {selectedMethod.label.toLowerCase()} payment link after Create order.</p>
                )
              )}
              <Label className="font-normal">
                <Switch checked={paidNow} onCheckedChange={setPaidNow} />
                <span className="text-sm font-medium">Already paid</span>
                <span className="text-muted-foreground text-xs">Attach their screenshot; the plan starts on create.</span>
              </Label>
              {paidNow && <PaymentProofField value={proof} onChange={setProof} />}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Simulated. No real payment methods enabled.</p>
          )}
        </Section>

        <Collapsible className="grid gap-3">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="justify-between">
              <span className="flex items-center gap-2">
                Discounts
                {discountCount > 0 && <Badge variant="success-light">{discountCount}</Badge>}
                {savedTotal > 0 && <span className="text-muted-foreground font-normal tabular-nums">−${savedTotal.toFixed(2)}</span>}
              </span>
              <ChevronDownIcon />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="couponCode">Coupon</Label>
              {coupons?.applied.map((c) => (
                <div key={c.code} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                  <span><span className="font-medium tabular-nums">{c.code}</span> <span className="text-muted-foreground">{c.auto ? "Applied automatically" : c.name}</span></span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">−${c.amount.toFixed(2)}</span>
                    {!c.auto && <Button type="button" variant="ghost" size="sm" onClick={() => d.removeCoupon(c.code)}>Remove</Button>}
                  </span>
                </div>
              ))}
              <div className="flex gap-2">
                <Input id="couponCode" value={d.couponInput} placeholder="Enter code" onChange={(e) => d.setCouponInput(e.target.value.toUpperCase())}
                  // Enter would otherwise submit the order.
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (d.couponInput.trim()) d.applyCoupon(d.couponInput); } }} />
                <Button type="button" variant="outline" disabled={!d.couponInput.trim()} onClick={() => d.applyCoupon(d.couponInput)}>Apply</Button>
              </div>
              {coupons && couponCodes.filter((code) => !coupons.applied.some((c) => c.code.toUpperCase() === code)).map((code) => {
                const why = coupons.codeErrors.find((e) => e.code === code)?.error ?? coupons.notApplied.find((n) => n.code.toUpperCase() === code)?.reason ?? "Not applied";
                return (
                  <p key={code} role="alert" className="text-destructive flex items-center gap-2 text-xs">
                    <span><span className="tabular-nums">{code}</span>: {why}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => d.removeCoupon(code)}>Remove</Button>
                  </p>
                );
              })}
              {coupons?.error && <p role="alert" className="text-destructive text-xs">{coupons.error}</p>}
              {coupons && coupons.available.some((c) => !couponCodes.includes(c.code.toUpperCase())) && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">Available</span>
                  {coupons.available.filter((c) => !couponCodes.includes(c.code.toUpperCase())).length > 1 && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => d.applyAllCoupons(coupons.available.map((c) => c.code))}>Apply all applicable</Button>
                  )}
                  {coupons.available.filter((c) => !couponCodes.includes(c.code.toUpperCase())).map((c) => (
                    <Button key={c.code} type="button" variant="outline" size="sm" title={c.name} onClick={() => d.applyCoupon(c.code)}>
                      <span className="tabular-nums">{c.code}</span> · {discountLine(c)}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Only a matched customer has a wallet; a new customer gets no coins row. */}
            {d.coinPreview && <CoinsField onOrder coins={d.coinPreview} setCoins={d.setCoinsWanted} />}

            <CustomerCodeField onOrder subtotal={d.subtotal} apply={d.applyStaffCode} note={`New order: ${fullName || email}`} />

            {repInfo && !(repInfo.available === false && repInfo.reason === "disabled") && (
              repInfo.available ? (
                <div className="grid gap-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{repInfo.name} <span className="tabular-nums">({repInfo.code})</span></span>
                    <span className="text-muted-foreground text-xs">Up to {repInfo.capPct}% or ${repInfo.capAmount.toFixed(2)}, whichever is lower</span>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="grid flex-1 gap-1.5">
                      <Label htmlFor="repDiscount">Discount amount</Label>
                      <Input id="repDiscount" type="number" inputMode="decimal" min={0} max={d.ceiling} step={0.01} value={discount ? String(discount) : ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          d.setDiscount(Number.isFinite(n) ? Math.max(0, Math.min(round2(n), d.ceiling)) : 0);
                        }} />
                    </div>
                    <Button type="button" variant="outline" onClick={() => d.setDiscount(d.ceiling)} disabled={d.ceiling <= 0}>Max</Button>
                    {discount > 0 && <Button type="button" variant="ghost" onClick={() => d.setDiscount(0)}>Clear</Button>}
                  </div>
                  <p className="text-muted-foreground text-xs tabular-nums">Ceiling for this order: ${d.ceiling.toFixed(2)}</p>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {repInfo.reason === "used" ? "Today's coupon was already used." : repInfo.reason === "expired" ? "Today's coupon has expired." : "No discount available today."}
                </p>
              )
            )}
          </CollapsibleContent>
        </Collapsible>

        <Section title="Price">
          {shownPreview ? (
            <OrderPricingBreakdown result={shownPreview} currency={currency} />
          ) : (
            <p className="text-muted-foreground text-sm">Pick a diet and meal size to see the price.</p>
          )}
          {!shownPreview && previewError && mealSizeId && <p role="alert" className="text-destructive text-xs">{previewError}</p>}
        </Section>
        </div>
      </div>

      <div className="bg-background/80 sticky bottom-0 mt-auto grid gap-2 border-t px-5 py-3 backdrop-blur-xl">
        {(contactError || error) && (
          <Alert variant="destructive"><AlertDescription>{contactError ?? error}</AlertDescription></Alert>
        )}
        <div className="flex items-center justify-between gap-3">
          {step === 2 && <Button type="button" variant="outline" size="lg" disabled={submitting} onClick={() => setStep(1)}>Back</Button>}
          <div className="mr-auto grid text-sm">
            <span>
              <span className="text-muted-foreground">Total </span>
              <span className="font-medium tabular-nums">{shownPreview ? `$${shownPreview.total.toFixed(2)}` : "—"}</span>
              {shownPreview && <span className="text-muted-foreground tabular-nums"> · {shownPreview.tiffinCount} {shownPreview.tiffinCount === 1 ? "tiffin" : "tiffins"}</span>}
            </span>
            {step === 1 && mealLabel && <span className="text-muted-foreground text-xs">{mealLabel}</span>}
            {missing.length > 0 && <span className="text-muted-foreground text-xs">Still needed: {missing.join(", ")}</span>}
          </div>
          <div className="flex items-center gap-2">
            {step === 1 ? (
              // Distinct keys: one <button> reused across types could let the click land as a submit.
              <Button key="continue" type="button" size="lg" disabled={missing.length > 0} onClick={goContinue}>Continue</Button>
            ) : (
              <Button key="submit" type="submit" size="lg" disabled={submitting || missing.length > 0}>
                {submitting ? <><Loader2Icon className="animate-spin" /> Creating…</> : "Create order"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
