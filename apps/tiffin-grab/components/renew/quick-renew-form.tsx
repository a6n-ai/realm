"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { formatAddress } from "@foundry/address/ui";
import { BottomBar, Button, Card, Notice, Pill, Sheet } from "@/components/customer/kit";
import { buttonClass } from "@/components/customer/kit/button-class";
import { CheckoutAddressPicker } from "@/components/checkout/checkout-address-picker";
import { AddonsPanel } from "@/components/wizard/addons-panel";
import { pickedAddons, type WizardSelections } from "@/components/wizard/selections";
import { StepDuration } from "@/components/wizard/steps/step-duration";
import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";
import { TotalChip } from "@/components/wizard/total-chip";
import { CHECKOUT_STEPS, Progress } from "@/components/wizard/progress";
import { PlanSummary } from "@/components/wizard/plan-summary";
import { Invoice } from "@/components/wizard/invoice";
import type { CurrentPlanSummary } from "@/components/wizard/current-plan-hint";
import { dropOffCatalog } from "@/lib/catalog/drop-off";
import { QuickRenewFormAdmin } from "./quick-renew-form-admin";
import { useQuickRenew } from "./use-quick-renew";
import type { QuickRenewData } from "./types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export type QuickRenewFormProps = QuickRenewData & {
  variant: "customer" | "admin";
  submitLabel: string;
  /** Returns an error message, or null when the order was placed. */
  onSubmit: (s: WizardSelections, addressPublicId: string | null) => Promise<string | null>;
  /** Customer only: back to the full stepper to change meal or days. */
  changePlanHref?: string;
  /** Customer only: hands the current picks to the page, which sends the customer to checkout to type a new address. */
  onUseNewAddress?: (s: WizardSelections) => void;
};

/** One-screen renewal: everything prefilled, one button to pay. `variant` picks the shell over one shared state hook. */
export function QuickRenewForm({ variant, changePlanHref, onUseNewAddress, ...data }: QuickRenewFormProps) {
  return variant === "admin" ? <QuickRenewFormAdmin {...data} /> : <CustomerShell {...data} changePlanHref={changePlanHref} onUseNewAddress={onUseNewAddress} />;
}

function CustomerShell({ changePlanHref, onUseNewAddress, ...data }: QuickRenewData & Pick<QuickRenewFormProps, "submitLabel" | "onSubmit" | "changePlanHref" | "onUseNewAddress">) {
  const q = useQuickRenew(data);
  const { sel, set, catalog, price } = q;
  const router = useRouter();
  const [pickingAddress, setPickingAddress] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [addonsOpen, setAddonsOpen] = useState(false);
  const picked = pickedAddons(catalog, sel);
  const color = data.tagColor && HEX.test(data.tagColor) ? data.tagColor : null;
  const dropOff = dropOffCatalog(catalog.deliveryCharges, catalog.waivers);
  const diet = data.tagLabel || q.plan?.name;
  // StepDuration reads this as "a plan is running" and explains why the start date sits after it.
  const currentPlan: CurrentPlanSummary | null = data.minStartDate
    ? { planName: q.plan?.name ?? "", mealSizeName: q.meal?.name ?? "", daysPerWeek: (sel.eatingDays ?? []).length, status: "active", startDate: "" }
    : null;
  const goBack = () => router.push("/me", { transitionTypes: ["nav-back"] });
  // The last price stays on screen while a change reprices, so the total never flickers to a placeholder.
  const result = price.result;

  return (
    <div className="pb-44 sm:pb-6">
      <SubscribeChrome closeHref="/me" onBack={goBack} stepTag="Renew"
        trailing={result ? <TotalChip tiffinCount={result.tiffinCount} total={result.total} open={invoiceOpen} onOpen={() => setInvoiceOpen(true)} /> : null}
      />

      <Progress steps={CHECKOUT_STEPS} current={0} />

      <h2 className="mb-6 text-[34px] leading-[1.06] font-bold tracking-[-0.03em] text-balance sm:text-[40px]">Renew your plan.</h2>

      <div className="flex flex-col gap-6">
        <Card aria-label="Your plan" data-testid="plan-card" className="px-4 py-4" style={color ? { borderLeft: `4px solid ${color}` } : undefined}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="c-h2">{q.meal?.name ?? "Your plan"}</p>
            {diet && <Pill tone="soft" size="sm">{diet}</Pill>}
          </div>
          <p className="c-caption mt-1">{(sel.eatingDays ?? []).map((d) => DAY_LABEL[d] ?? d).join(", ")}</p>
          {picked.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Add-ons">
              {picked.map((a) => <Pill key={a.name} tone="soft" size="sm">{a.name}{a.qty > 1 ? ` ×${a.qty}` : ""}</Pill>)}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {q.addons.length > 0 && (
              <Button variant="quiet" pill onClick={() => setAddonsOpen(true)}>
                <PlusIcon aria-hidden className="size-4" />
                {picked.length > 0 ? "Edit add-ons" : "Add-ons"}
              </Button>
            )}
            {changePlanHref && (
              <Link href={changePlanHref} className={buttonClass({ variant: "quiet", pill: true })}>Change meal or days</Link>
            )}
          </div>
        </Card>

        <StepDuration
          catalog={catalog}
          selections={sel}
          set={set}
          result={result}
          currentPlan={currentPlan}
          minStartDate={data.minStartDate}
          lastTiffin={data.lastTiffin}
          holidayDates={data.holidayDates}
        />

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-[13px] font-semibold tracking-[0.02em]">Deliver to</p>
            {data.savedAddresses.length > 1 && (
              <Button variant="quiet" pill onClick={() => setPickingAddress((o) => !o)}>{pickingAddress ? "Done" : "Change"}</Button>
            )}
          </div>
          {pickingAddress ? (
            <CheckoutAddressPicker
              addresses={data.savedAddresses}
              value={q.addressId}
              onPick={(a) => { q.setAddressId(a?.publicId ?? null); setPickingAddress(false); }}
              dropOff={dropOff}
              dropOffs={data.addressDropOffs}
            />
          ) : (
            <p className="c-body">
              {q.address ? <><span className="font-semibold">{q.address.label}</span> <span className="c-caption">{formatAddress(q.address)}</span></> : <span className="c-caption">No saved address yet.</span>}
            </p>
          )}
          {onUseNewAddress && (
            <Button variant="quiet" pill className="self-start" onClick={() => onUseNewAddress(sel)}>Use a different address</Button>
          )}
        </div>

        {price.error && (
          <Notice tone="error">
            <span className="flex items-center gap-2">{price.error}<Button variant="quiet" pill onClick={q.retry}>Retry</Button></span>
          </Notice>
        )}
        {q.submitError && <Notice tone="error">{q.submitError}</Notice>}
      </div>

      <Sheet bottom open={invoiceOpen && result != null} onClose={() => setInvoiceOpen(false)} title="Price summary">
        {result && (
          <div className="space-y-3 pb-3">
            <PlanSummary
              baseline={q.plan?.name}
              mealName={q.meal?.name}
              deliveryName={catalog.frequencies.find((f) => f.key === sel.frequencyKey)?.name}
              eatingDays={sel.eatingDays ?? []}
              weeks={sel.durationWeeks}
              startDate={sel.startDate}
              tiffinCount={result.tiffinCount}
              addons={picked}
            />
            <Invoice result={result} />
          </div>
        )}
      </Sheet>

      <Sheet
        bottom
        open={addonsOpen}
        onClose={() => setAddonsOpen(false)}
        title="Add to every tiffin?"
        footer={<Button variant="primary" size="lg" className="w-full" onClick={() => setAddonsOpen(false)}>{q.addonCount > 0 ? "Done" : "Skip extras"}</Button>}
      >
        <p className="text-muted-foreground -mt-1 mb-3 text-[13px]">Optional extras for your {q.meal?.name ?? "meal"}, billed per tiffin.</p>
        <AddonsPanel bare addons={q.addons} categoryLabels={catalog.categoryLabels} selections={sel} set={set} className="pb-2" />
      </Sheet>

      <BottomBar alignEnd className="sm:sticky sm:mt-6 sm:px-0">
        <Button variant="quiet" size="lg" className="w-24 shrink-0 sm:hidden" onClick={goBack}>Back</Button>
        <Button variant="primary" size="lg" className="flex-1 sm:min-h-10 sm:flex-none sm:px-8" disabled={!q.canSubmit} pending={q.submitting} onClick={q.submit}>{data.submitLabel}</Button>
      </BottomBar>
    </div>
  );
}
