"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Country as CountryCode } from "react-phone-number-input";
import { isValidPhoneNumber as isValidPhone } from "libphonenumber-js";
import { CheckIcon, Loader2Icon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { estimatePrefill, renewPrefill } from "../../discounts/estimate-actions";
import { toast } from "sonner";
import { emailSchema } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/reui/stepper";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@foundry/ui/card";
import { makeImageThumbnail } from "@/components/ds";
import { unwrapAction } from "@/lib/actions/unwrap";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import type { OrderFormInput } from "../../inquiries/[id]/order-schema";
import { useOrderDraft } from "../../inquiries/[id]/order/use-order-draft";
import { type Catalog } from "../../inquiries/[id]/order/order-draft";
import { interestToPrefill } from "../../inquiries/_leads/interest-prefill";
import { CustomerSearch } from "../../_leads/customer-search";
import { InquiryMatch } from "../../_leads/inquiry-match";
import { NoSources } from "../../_leads/no-sources";
import { useExistingCustomer } from "../../_leads/use-existing-customer";
import { getInquiryInterestForPrefill, type CustomerHit } from "../../_leads/match-actions";
import { AdminOrderCreatedPanel, type AdminOrderCreated } from "../admin-order-created-dialog";
import { CreatedOrderDetails, createdOrderFacts, whatsAppOrderMessage } from "./created-order-details";
import { createOrderFlow, saveOrderLeadAction, settleNewOrderWithProofAction } from "../actions";
import { PaymentProofField, type PaymentProofValue } from "../payment-proof-field";
import { FormDrawer } from "../form-drawer";
import { DeliverySection, DiscountsSection, Field, PaymentSection, PlanSection, PriceSection, RunningPlansField, Section } from "./order-sections";

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

const STEPS = ["Order", "Delivery & payment"] as const;

const PhoneInput = dynamic(() => import("@foundry/ui/phone-input").then((m) => m.PhoneInput), {
  ssr: false,
  loading: () => <Input disabled placeholder="Phone" />,
});


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
  const { form, submitting, error, customerCtx, planKey, mealSizeId, startDate, isTrial, eligibleAddons, shownPreview, created } = d;

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
            <RunningPlansField plans={customerCtx.plans} selectedId={renewedFrom} busyId={renewing ? renewingId : null} onPick={(p) => void renewFrom(p.publicId, p.deploymentId)} />
          ) : pickedCustomerId && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs text-pretty">Same meal, schedule, add-ons and address as their last plan.</p>
              <Button type="button" variant="outline" disabled={renewing} onClick={() => void renewLast(pickedCustomerId)}>
                {renewing ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Renew last plan
              </Button>
            </div>
          )}
        </Section>

        <PlanSection d={d} catalog={catalog} />

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
        <DeliverySection d={d} />

        <PaymentSection d={d} customerName={fullName} extra={
          <>
            <Label className="font-normal">
              <Switch checked={paidNow} onCheckedChange={setPaidNow} />
              <span className="text-sm font-medium">Already paid</span>
              <span className="text-muted-foreground text-xs">Attach their screenshot; the plan starts on create.</span>
            </Label>
            {paidNow && <PaymentProofField value={proof} onChange={setProof} />}
          </>
        } />

        <DiscountsSection d={d} customerLabel={fullName || email} />

        <PriceSection d={d} currency={currency} />
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
