"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/reui/stepper";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@foundry/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Skeleton } from "@foundry/ui/skeleton";
import { discountLine } from "@/components/customer/home/coupons-section";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import { OrderForm, type EstimateState } from "../inquiries/[id]/order/order-form";
import { OrderPricingBreakdown } from "../orders/[id]/order-pricing-breakdown";
import { CustomerSearch } from "../_leads/customer-search";
import type { CustomerHit } from "../_leads/match-actions";
import { estimateFormData } from "./estimate-actions";
import { issueRepCode, repCodeAllowance, type RepCodeAllowance } from "./rep-code-actions";

type FormData = Awaited<ReturnType<typeof estimateFormData>>;

const WHO = [
  { value: "new", label: "New customer", hint: "Priced as a first order. No contact needed." },
  { value: "existing", label: "Existing customer", hint: "Their coupon limits and running plan apply." },
] as const;

// Each step stays reachable: click any step to go back and change it.
const STEPS = ["Customer", "Plan", "Delivery & payment"] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Sales quotes the exact amount before taking payment: the same server preview createOrder
// prices with (catalog discounts, auto/typed coupons, method + province tax). Pricing reads
// coupons and never redeems them; only an order the customer places uses one. A staff code is
// issued from here only, so it is always sized against a real order.
export function EstimateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [data, setData] = useState<FormData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [existing, setExisting] = useState(false);
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const [estimate, setEstimate] = useState<EstimateState | null>(null);
  const [step, setStep] = useState(1);
  // A new customer has no account, so the preview judges first-order coupons as eligible.
  const who = existing && customer ? customer : null;

  const fetchData = () => estimateFormData().then(setData).catch(() => setLoadError(true));
  const retry = () => {
    setLoadError(false);
    void fetchData();
  };
  useEffect(() => {
    if (open && !data) void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copy = async () => {
    if (!estimate?.copyText) return;
    try {
      await navigator.clipboard.writeText(estimate.copyText);
      toast.success("Message copied. Paste it in WhatsApp");
    } catch {
      toast.error("Couldn't copy the estimate");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="gap-0.5 border-b p-4">
          <DialogTitle>Estimate order</DialogTitle>
          <DialogDescription>The exact total with coupons and discounts. Nothing is saved or used up.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_20rem] md:overflow-hidden">
          <div className="grid min-h-0 content-start gap-6 px-4 pt-4 md:overflow-y-auto">
            <Stepper value={step} onValueChange={setStep} indicators={{ completed: <CheckIcon className="size-4" aria-hidden /> }}>
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
              <section className={step === 1 ? "grid gap-4 pb-4" : "hidden"}>
              <RadioGroup aria-label="Customer" value={existing ? "existing" : "new"} onValueChange={(v) => setExisting(v === "existing")}>
                {WHO.map((w) => (
                  <Label
                    key={w.value}
                    htmlFor={`estimate-${w.value}`}
                    className="hover:bg-muted/40 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
                  >
                    <RadioGroupItem id={`estimate-${w.value}`} value={w.value} className="mt-0.5" />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">{w.label}</span>
                      <span className="text-muted-foreground text-xs font-normal">{w.hint}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              {existing && (customer ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>{customer.fullName ?? "Unnamed customer"}</CardTitle>
                    <CardDescription className="tabular-nums">{[customer.phone, customer.email].filter(Boolean).join(" · ")}</CardDescription>
                    <CardAction>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setCustomer(null)}>Change</Button>
                    </CardAction>
                  </CardHeader>
                </Card>
              ) : (
                <CustomerSearch onPick={setCustomer} />
              ))}
              <Button type="button" className="justify-self-end" disabled={existing && !customer} onClick={() => setStep(2)}>Continue</Button>
              </section>
            {loadError ? (
              <div className="flex items-center justify-between gap-3">
                <p role="alert" className="text-destructive text-sm">Couldn&apos;t load the plans.</p>
                <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
              </div>
            ) : !data ? (
              <div className={step === 1 ? "hidden" : "grid gap-3"}>
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              // Mounted from the start and only hidden on step 1, so going back keeps what was picked.
              <div className={step === 1 ? "hidden" : undefined}>
              <OrderForm
                estimateOnly
                page={step === 2 ? "order" : "payment"}
                onContinue={() => setStep(3)}
                inquiryId=""
                contact={{ fullName: who?.fullName ?? "", phone: who?.phone ?? "", email: who?.email ?? "" }}
                catalog={data.catalog}
                enabledSlots={data.enabledSlots}
                onEstimate={setEstimate}
              />
              </div>
            )}
          </div>

          <aside className="flex min-h-0 flex-col gap-6 border-t p-4 md:overflow-y-auto md:border-t-0 md:border-l">
            <section className="grid gap-3">
              <p className="text-sm font-medium">Price</p>
              {estimate?.preview && data ? (
                <OrderPricingBreakdown result={estimate.preview} currency={data.currency} />
              ) : estimate?.error ? (
                // The plan can't be priced as picked (e.g. weekend days on a meal with no weekend dish).
                <p role="alert" className="text-destructive text-sm">{estimate.error}</p>
              ) : (
                <p className="text-muted-foreground text-sm">Pick a diet and meal size to see the total.</p>
              )}
            </section>

            {estimate && <CouponsField estimate={estimate} />}

            <CustomerCodeField
              subtotal={estimate?.preview?.subtotal ?? 0}
              apply={estimate?.apply}
              note={who?.fullName ?? undefined}
            />

            <Button type="button" className="mt-auto" disabled={!estimate?.copyText} onClick={() => void copy()}>
              <CopyIcon className="size-4" /> Copy WhatsApp message
            </Button>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Issues a one-off code on the rep's own allowance, capped against this order, and applies it to
// the estimate so the total shown is what the customer pays after entering it at checkout.
function CustomerCodeField({ subtotal, apply, note }: { subtotal: number; apply?: (code: string) => void; note?: string }) {
  const tz = useTimezone();
  const [allowance, setAllowance] = useState<RepCodeAllowance | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ code: string; amount: number; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    repCodeAllowance()
      .then((r) => ("error" in r ? setError(r.error) : setAllowance(r.allowance)))
      .catch(() => setError("Couldn't load your allowance"));
  }, []);

  // A new customer remounts the form: put the issued code back on it. applyCoupon ignores a repeat.
  useEffect(() => {
    if (issued && apply) apply(issued.code);
  }, [issued, apply]);

  // The server caps the code at redeem time too; this keeps the quoted total honest.
  const ceiling = allowance ? round2(Math.min(allowance.capAmount, (subtotal * allowance.capPct) / 100)) : 0;
  const value = Number(amount);
  const valid = allowance != null && allowance.left > 0 && value > 0 && value <= ceiling;

  const generate = async () => {
    setBusy(true);
    setError(null);
    const r = await issueRepCode(value, note ? `Estimate: ${note}` : "Order estimate").catch(() => ({ error: "Couldn't create the code. Try again." }));
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setAllowance(r.allowance);
    setIssued({ code: r.code, amount: value, expiresAt: r.expiresAt });
    setCopied(false);
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy. Select the code and copy it by hand.");
    }
  };

  if (!allowance && !error) return null;

  return (
    <section className="grid gap-3">
      <Label htmlFor="estimate-code-amount">Customer code</Label>
      {issued ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="tabular-nums tracking-wider select-all">{issued.code}</CardTitle>
            <CardDescription className="tabular-nums">
              ${issued.amount.toFixed(2)} off until {formatEpoch(issued.expiresAt, { mode: "datetime", timeZone: tz })}. Included in the price; the customer enters it at checkout.
            </CardDescription>
            <CardAction>
              <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />} {copied ? "Copied" : "Copy"}
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
      ) : allowance ? (
        <div className="grid gap-2">
          <div className="flex gap-2">
            <Input
              id="estimate-code-amount"
              type="number"
              inputMode="decimal"
              min={0}
              max={ceiling}
              step={0.01}
              placeholder="Amount off"
              disabled={subtotal <= 0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && valid && !busy) void generate(); }}
            />
            <Button type="button" variant="outline" disabled={ceiling <= 0} onClick={() => setAmount(String(ceiling))}>Max</Button>
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {subtotal > 0 ? `Up to $${ceiling.toFixed(2)} on this order` : "Price the order first"} · {allowance.left} of {allowance.total} left today
          </p>
          <Button type="button" variant="outline" disabled={!valid || busy} onClick={() => void generate()}>
            {busy ? "Creating…" : "Generate code"}
          </Button>
        </div>
      ) : null}
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    </section>
  );
}

// The coupon lane as checkout runs it: auto-applied ones, typed codes with why one did not land,
// and the codes this customer could use.
function CouponsField({ estimate }: { estimate: EstimateState }) {
  const [input, setInput] = useState("");
  const { coupons, codes, apply, remove, applyAll } = estimate;
  const open = coupons?.available.filter((c) => !codes.includes(c.code.toUpperCase())) ?? [];
  const submit = () => {
    if (!input.trim()) return;
    apply(input);
    setInput("");
  };

  return (
    <section className="grid gap-3">
      <Label htmlFor="estimate-coupon">Coupons</Label>
      {coupons?.applied.map((c) => (
        <div key={c.code} className="flex items-center justify-between gap-2 text-sm">
          <span className="grid gap-0.5">
            <span className="font-medium tabular-nums">{c.code}</span>
            <span className="text-muted-foreground text-xs">{c.auto ? "Applied automatically" : c.name}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="tabular-nums">−${c.amount.toFixed(2)}</span>
            {!c.auto && <Button type="button" variant="ghost" size="sm" onClick={() => remove(c.code)}>Remove</Button>}
          </span>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          id="estimate-coupon"
          value={input}
          placeholder="Enter code"
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <Button type="button" variant="outline" disabled={!input.trim()} onClick={submit}>Apply</Button>
      </div>
      {coupons && codes
        .filter((code) => !coupons.applied.some((c) => c.code.toUpperCase() === code))
        .map((code) => (
          <p key={code} role="alert" className="text-destructive flex items-center justify-between gap-2 text-sm">
            <span><span className="tabular-nums">{code}</span>: {coupons.codeErrors.find((e) => e.code === code)?.error
              ?? coupons.notApplied.find((n) => n.code.toUpperCase() === code)?.reason
              ?? "Not applied"}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(code)}>Remove</Button>
          </p>
        ))}
      {coupons?.error && <p role="alert" className="text-destructive text-sm">{coupons.error}</p>}
      {open.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {open.length > 1 && (
            <Button type="button" variant="secondary" size="sm" onClick={() => applyAll(open.map((c) => c.code))}>Apply all</Button>
          )}
          {open.map((c) => (
            <Button key={c.code} type="button" variant="outline" size="sm" title={c.name} onClick={() => apply(c.code)}>
              <span className="tabular-nums">{c.code}</span> · {discountLine(c)}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
