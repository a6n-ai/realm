"use client";

import { useState } from "react";
import { CalendarDaysIcon, ChevronDownIcon, CopyIcon, MinusIcon, PlusIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { weekdayKey } from "@foundry/commons";
import { appToday } from "@/lib/services/start-date";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { AddressFields } from "@foundry/ui/address-fields";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@foundry/ui/command";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Badge } from "@/components/reui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toggleVariants } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DateInput } from "@/components/dashboard/date-fields";
import { DeliveryAreaNote } from "@/components/customer/address/delivery-area";
import { ScheduleCard } from "@/components/wizard/schedule-card";
import { discountLine } from "@/components/customer/home/coupons-section";
import { dropOffSummary } from "@/lib/catalog/drop-off";
import { allowedDaysError, dayAllowed, eatingDaysError, onlyOnMessage, type DayOfWeek } from "@/lib/menu/delivery-days";
import { toggleTrialPick } from "@/lib/trial/schedule";
import type { CheckoutPaymentMethod } from "@/app/(public)/subscribe/actions";
import type { useOrderDraft } from "../../inquiries/[id]/order/use-order-draft";
import { dayBeforeIso, round2, type Catalog } from "../../inquiries/[id]/order/order-draft";
import { CustomerCodeField } from "../../discounts/customer-code-field";
import { CoinsField } from "../../discounts/coins-field";
import { OrderPricingBreakdown } from "../[id]/order-pricing-breakdown";
import { DropOffToggles } from "./drop-off-toggles";

export type Draft = ReturnType<typeof useOrderDraft>;

const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const dayName = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);
const APP_NAME = "Tiffin Grab";

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
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

export function Field({ label, hint, error, children }: { label: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode }) {
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

/** Diet, meal size, add-ons, duration, start date, days and the delivery calendar. */
export function PlanSection({ d, catalog }: { d: Draft; catalog: Catalog }) {
  const [addonPickerOpen, setAddonPickerOpen] = useState(false);
  const { form, planKey, mealSizeId, frequencyKey, eatingDays, startDate, bounds, sizeDays, isTrial, deliveryFrequencies, durations, eligibleAddons, estimateOnly } = d;
  const errors = form.formState.errors;
  const meals = planKey ? catalog.mealSizes.filter((m) => m.diet === planKey) : [];
  function pickPlan(key: string) {
    form.setValue("planKey", key, { shouldDirty: true, shouldValidate: true });
    const next = catalog.mealSizes.filter((m) => m.diet === key);
    if (!next.some((m) => m.id === mealSizeId)) form.setValue("mealSizeId", next[0]?.id ?? "", { shouldDirty: true, shouldValidate: true });
  }

  const deliveryDays = (deliveryFrequencies.find((f) => f.key === frequencyKey)?.weekdays ?? []) as DayOfWeek[];
  const enough = eatingDays.length >= bounds.min;
  const eatingError = enough ? (eatingDaysError(deliveryDays, eatingDays, bounds) ?? allowedDaysError(eatingDays, sizeDays)) : `Pick ${bounds.min} to ${bounds.max} eating days a week.`;

  // The next three days this plan can start (cutoff, renewal, trial and weekend rules all apply),
  // named Today/Tomorrow/Day after when they are, else by date. A fixed "today/tomorrow" set would be
  // all-disabled from Friday to Sunday.
  const calendarToday = appToday(catalog.timezone).toISOString().slice(0, 10);
  const relative = ["Today", "Tomorrow", "Day after"];
  const quickStarts: { iso: string; label: string }[] = [];
  for (let n = 0, day = new Date(`${d.minStart}T00:00:00Z`); n < 21 && quickStarts.length < 3; n++, day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = weekdayKey(day) as DayOfWeek;
    const startable = isTrial ? d.trialWeekdays.includes(weekday) : day.getUTCDay() !== 0 && day.getUTCDay() !== 6;
    if (!startable) continue;
    const iso = day.toISOString().slice(0, 10);
    const offset = Math.round((Date.parse(iso) - Date.parse(calendarToday)) / 86_400_000);
    const label = relative[offset] ?? day.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    quickStarts.push({ iso, label });
  }

  return (
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
          {!estimateOnly && <Field label="Start date" error={errors.startDate?.message}>
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
          </Field>}

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
  );
}

export function DeliverySection({ d }: { d: Draft }) {
  const { form, estimateOnly, customerCtx, deliveryOptions, addressLine, city, postalCode, submitting } = d;
  const errors = form.formState.errors;
  const savedAddress = d.addressPublicId != null;
  const addressTags = deliveryOptions?.deliveryCharges?.addressTags ?? [];
  const tagName = addressTags.find((t) => t.id === d.addressTagId)?.name;
  const extrasSummary = [tagName, dropOffSummary(d.dropOffs, d.dropOff), !estimateOnly && d.notes.trim() && `"${d.notes.trim().slice(0, 30)}"`].filter(Boolean).join(" · ") || "None set";

  return (
        <Section title={estimateOnly ? "Delivery" : "Address"}>
          {!estimateOnly && customerCtx.addresses.length > 0 && (
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
              fields={estimateOnly ? ["postalCode"] : ["addressLine", "city", "postalCode"]}
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
              {!estimateOnly && <Field label="Delivery notes" hint={savedAddress ? "From the saved address" : undefined}>
                <Textarea value={d.notes} onChange={(e) => d.setNotes(e.target.value)} disabled={savedAddress} placeholder="Buzzer code, leave at door, call on arrival…" rows={2} maxLength={500} />
              </Field>}
            </CollapsibleContent>
          </Collapsible>
        </Section>
  );
}

export function PaymentSection({ d, customerName, extra }: { d: Draft; customerName: string; extra?: React.ReactNode }) {
  const { shownPreview } = d;
  const selectedMethod = d.paymentMethods.find((m) => m.id === d.paymentMethodId);
  // Staff paste this into WhatsApp/SMS; the order code isn't known until create.
  async function copyPaymentDetails(m: CheckoutPaymentMethod) {
    const amount = shownPreview ? `$${shownPreview.total.toFixed(2)}` : "the order total";
    const lines = [
      `Hi ${customerName.split(" ")[0] || "there"}, your ${APP_NAME} order total is ${amount}.`,
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
              {extra}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Simulated. No real payment methods enabled.</p>
          )}
        </Section>
  );
}

export function DiscountsSection({ d, customerLabel }: { d: Draft; customerLabel: string }) {
  const { coupons, couponCodes, repInfo, discount, shownPreview } = d;
  const discountCount = (coupons?.applied.length ?? 0) + (discount > 0 ? 1 : 0) + ((d.coinPreview?.used ?? 0) > 0 ? 1 : 0);
  const savedTotal = (shownPreview?.adjustments ?? []).reduce((sum, a) => sum + a.amount, 0);

  return (
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

            <CustomerCodeField onOrder subtotal={d.subtotal} apply={d.applyStaffCode} note={`New order: ${customerLabel}`} />

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
  );
}

export function PriceSection({ d, currency }: { d: Draft; currency: string }) {
  const { shownPreview, previewError, mealSizeId } = d;
  return (
        <Section title="Price">
          {shownPreview ? (
            <OrderPricingBreakdown result={shownPreview} currency={currency} />
          ) : (
            <p className="text-muted-foreground text-sm">Pick a diet and meal size to see the price.</p>
          )}
          {!shownPreview && previewError && mealSizeId && <p role="alert" className="text-destructive text-xs">{previewError}</p>}
        </Section>
  );
}

type RunningPlan = { publicId: string; deploymentId: string; mealSize: string; status: string; startDate: string; lastDay: string; tiffinCount: number };

/** A customer's running plans as pills: tapping one starts the new order from it (meal, schedule, add-ons, address). */
export function RunningPlansField({ plans, selectedId, busyId, onPick }: { plans: RunningPlan[]; selectedId: string | null; busyId: string | null; onPick: (p: RunningPlan) => void }) {
  if (plans.length === 0) return null;
  return (
    <Field label="Running plans" hint="Tap one to renew it">
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-wrap gap-2">
          {plans.map((p) => (
            <button
              key={p.publicId}
              type="button"
              disabled={busyId != null}
              data-state={selectedId === p.publicId ? "on" : "off"}
              onClick={() => onPick(p)}
              className={toggleVariants({ variant: "outline", className: "max-w-full" })}
            >
              <RefreshCwIcon className={busyId === p.publicId ? "animate-spin" : undefined} />
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
  );
}
