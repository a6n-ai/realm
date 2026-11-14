/* eslint-disable */
"use client";
import { useAppCurrency } from "@/components/app-currency";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Invoice } from "./invoice";
import { formatDateOnly } from "@/lib/format/datetime";
import { PlanSummary } from "./plan-summary";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import { useReprice } from "@/lib/wizard/use-reprice";
import { useBounceAfterPaid } from "@/lib/payments/paid-flag";
import { BottomBar, Button, Sheet, buttonClass } from "@/components/kit";
import { AddonsPanel } from "./addons-panel";
import { trialSendDays } from "@/lib/trial/schedule";
import { firstBlockedStep, initialSelections, mealNote, nextBlockedReason, offeredAddons, pickedAddons, mealAllowedDays, selectionIsTrial, servesWeekends, reconcileSelections, type WizardOrigin, type WizardSelections } from "@/lib/wizard/selections";
import { wizardSession } from "@/lib/wizard/session";
import { StepBaseline } from "./steps/step-baseline";
import { StepBundle } from "./steps/step-bundle";
import { StepSchedule } from "./steps/step-schedule";
import { StepDuration } from "./steps/step-duration";
import { BestDeal } from "./best-deal";
import { SubscribeChrome } from "./subscribe-chrome";
import { CHECKOUT_STEPS, Progress } from "./progress";
import { anySameIsoWeek } from "./same-iso-week";
import type { CurrentPlanSummary } from "./current-plan-hint";
import { Checkout } from "@/components/checkout/checkout";
import { trackMeta } from "@foundry/meta-pixel/client";
import { gtagEvent } from "@foundry/google-analytics/client";
import { sendMetaClientEvent } from "@/lib/meta/actions";
import type { CheckoutProps } from "@/components/checkout/load-checkout-props";
import { IdentityGate } from "./identity-gate";
import { PauseCircle, Star, Truck } from "lucide-react";
import { DeliveryCheck } from "./delivery-check";

// Three pages over the four step checks (selections.ts keeps them, and checkout routes back by them):
// diet + meal size share page 0 (steps 0 and 1); schedule (2) and start date + length (3) keep their own.
const pageOf = (n: number) => (n <= 1 ? 0 : n >= 3 ? 3 : 2);

export function Wizard({
  catalog,
  closeHref,
  existingStartDates = [],
  currentPlan = null,
  origin = "subscribe",
  initial = initialSelections,
  minStartDate = null,
  lastTiffin = null,
  exitHref,
  trial = null,
  holidayDates = [],
  popular = {},
  quote = null,
  promoCodes = [],
  checkout,
  signIn,
  trust = null,
  intro,
}: {
  /** Offers to show on the first page (coupons a visitor can use, a friend's referral gift). */
  intro?: ReactNode;
  /** Real proof shown under the steps: the Google rating, and whether delivery is free. */
  trust?: { rating: number; reviews: number; freeDelivery: boolean } | null;
  /** Signed out: the plan is built and priced first; "Continue to checkout" asks who it's for, then opens /checkout. */
  signIn?: { googleClientId: string | null; oauthError: string | null; referralCode: string };
  /** Present: the last step opens Delivery and Payment in place instead of navigating to /checkout. */
  checkout?: CheckoutProps;
  /** A staff estimate link: the quoted picks (start here instead of a saved cart) and its coupon codes. */
  quote?: { picks: WizardSelections; codes: string[]; coins?: number } | null;
  /** Coupon codes from a promo link (/subscribe?c=CODE) with no quoted plan: checkout tries them with the first price. */
  promoCodes?: string[];
  catalog: ClientCatalogSnapshot;
  closeHref: string;
  existingStartDates?: string[];
  currentPlan?: CurrentPlanSummary | null;
  origin?: WizardOrigin;
  initial?: WizardSelections;
  /** First date a new/renewed plan may start (overlap with a live plan). */
  minStartDate?: string | null;
  /** Last tiffin of the customer's running plan(s): why the start date is not tomorrow. */
  lastTiffin?: string | null;
  exitHref?: string;
  /** Declared closed days; the start date cannot be one. */
  holidayDates?: string[];
  /** Most-ordered meal size ids per plan key, shown first on Bundle. */
  popular?: Record<string, string[]>;
  /** Open trial offer. Trial sizes then sit on Bundle and skip Schedule. */
  trial?: { maxDays: number; weekdays: string[] } | null;
}) {
  const currency = useAppCurrency();
  const router = useRouter();
  const bouncing = useBounceAfterPaid();
  // A quote opens on the first step that still needs the customer, normally Start.
  const [step, setStepState] = useState(() => (quote ? pageOf(firstBlockedStep(catalog, reconcileSelections(catalog, quote.picks)) ?? 3) : 0));
  const setStep = (n: number | ((s: number) => number)) =>
    setStepState((s) => {
      const next = typeof n === "function" ? n(s) : n;
      try { wizardSession.saveStep(next); } catch { /* storage unavailable */ }
      return next;
    });
  const [selections, setSelections] = useState<WizardSelections>(() => {
    const s = reconcileSelections(catalog, initial);
    // The diet toggle starts on the first plan, so the sizes and their prices show at once.
    const first = s.planKey == null ? catalog.plans[0] : undefined;
    return first ? reconcileSelections(catalog, { ...s, planKey: first.key, mealSlots: first.offeredSlots ?? [] }) : s;
  });
  const [result, setResult] = useState<PricingResult | null>(null);
  // First-order codes the signed-out price includes: checkout re-tries them signed in and says why if one drops.
  const [newOnlyCodes, setNewOnlyCodes] = useState<string[]>([]);
  const prevStep = useRef(step);
  const direction = step >= prevStep.current ? "forward" : "back";
  useEffect(() => {
    if (prevStep.current !== step) window.scrollTo({ top: 0 });
    prevStep.current = step;
  }, [step]);

  // "Edit plan" from checkout lands here again: restore what the customer had picked and the step they were on.
  useEffect(() => {
    try {
      // The quote is the newer intent; a cart saved earlier in this tab must not replace it.
      if (quote) return;
      if (wizardSession.origin() !== origin) return;
      const raw = wizardSession.selectionsRaw();
      if (!raw) return;
      const saved = JSON.parse(raw) as WizardSelections;
      if (saved.planKey != null && !catalog.plans.some((p) => p.key === saved.planKey)) return;
      let savedStep = pageOf(wizardSession.step() || 0);
      const restored = reconcileSelections(catalog, { ...initial, ...saved });
      // A field the catalog dropped since the cart was saved: reopen on the page that asks for it.
      const blockedAt = firstBlockedStep(catalog, restored);
      if (blockedAt != null && pageOf(blockedAt) < savedStep) savedStep = pageOf(blockedAt);
      /* eslint-disable react-hooks/set-state-in-effect */
      setSelections(restored);
      if (trial != null && catalog.mealSizes.some((m) => m.publicId === saved.mealSizeId && m.trial) && savedStep === 2) savedStep = 3;
      if (savedStep === 0 || savedStep === 2 || savedStep === 3) {
        prevStep.current = savedStep;
        setStepState(savedStep);
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch { /* unreadable saved plan: start fresh */ }
    // Mount-only restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<WizardSelections>) => setSelections((s) => ({ ...s, ...patch }));

  useReprice(
    () => {
      // No frequency until the Schedule step: pricing would throw "Invalid frequency" (a 500) on every Bundle pick.
      const trialPick = trial != null && selectionIsTrial(catalog, selections);
      if (!selections.mealSizeId || (trialPick ? selections.trialDays == null || !selections.startDate : !selections.frequencyKey)) return null;
      return [selections, undefined, selections.planKey ?? undefined];
    },
    {
      // Clearing the stale invoice when no meal is chosen; intentional effect-driven reset.
      onSkip: () => { setTimeout(() => setResult(null), 0); },
      onResult: (r) => {
        setResult("error" in r ? null : r.pricing);
        setNewOnlyCodes("error" in r ? [] : r.appliedCoupons.filter((c) => c.newCustomersOnly).map((c) => c.code));
      },
      onError: () => setResult(null),
    },
    [selections, trial, catalog],
  );

  const blocked = step === 0 ? nextBlockedReason(0, catalog, selections) ?? nextBlockedReason(1, catalog, selections) : nextBlockedReason(step, catalog, selections);
  // Once a meal is picked, the bar says what's picked, so nobody scrolls back up to check.
  const pickedNote = selections.mealSizeId ? mealNote(catalog, selections) : undefined;
  const canNext = blocked === null;

  const [atCheckout, setAtCheckout] = useState(false);
  // A failed Google round trip lands back on /subscribe?error=...: reopen the sign-in step it came from.
  const [atGate, setAtGate] = useState(() => !!signIn?.oauthError);

  const deploy = () => {
    const linkCodes = quote?.codes.length ? quote.codes : promoCodes;
    // Signed out, first-order codes ride along so checkout can say why one drops for a returning account.
    wizardSession.saveHandoff({ selections, origin, planSteps: [...stepLabels], codes: signIn ? [...new Set([...linkCodes, ...newOnlyCodes])] : linkCodes, coins: quote?.coins });
    const meal = catalog.mealSizes.find((m) => m.publicId === selections.mealSizeId);
    const contentIds = [selections.planKey, meal?.key].filter((x): x is string => !!x);
    const eventId = crypto.randomUUID();
    const params = {
      ...(contentIds.length ? { content_ids: contentIds, content_type: "product" } : {}),
      ...(result ? { value: result.total, currency } : {}),
      num_items: 1,
    };
    trackMeta("AddToCart", params, eventId);
    void sendMetaClientEvent({
      eventName: "AddToCart",
      eventId,
      eventSourceUrl: window.location.href,
      customData: params,
    });
    gtagEvent("add_to_cart", {
      ...(result ? { value: result.total, currency } : {}),
      items: contentIds.length
        ? contentIds.map((id) => ({ item_id: id, quantity: 1 }))
        : undefined,
    });
    if (checkout) {
      setAtCheckout(true);
      window.scrollTo({ top: 0 });
      return;
    }
    if (signIn) {
      gtagEvent("begin_checkout", { ...(result ? { value: result.total, currency: "CAD" } : {}), signed_in: false });
      setAtGate(true);
      window.scrollTo({ top: 0 });
      return;
    }
    router.push("/checkout", { transitionTypes: ["nav-forward"] });
  };

  const sameWeekConflict =
    selections.startDate !== "" && anySameIsoWeek(selections.startDate, existingStartDates);

  const trialSelected = trial != null && selectionIsTrial(catalog, selections);
  const stepLabels = trialSelected ? (["Tiffin", "Start"] as const) : (["Tiffin", "Schedule", "Start"] as const);
  const questions = trialSelected
    ? (["Pick your tiffin.", "When should the trial start?"] as const)
    : (["Pick your tiffin.", "Set your schedule.", "When do you start?"] as const);
  const progressIndex = step === 0 ? 0 : trialSelected ? 1 : step === 2 ? 1 : 2;

  const goBack = () => {
    if (step > 0) {
      setStep(step === 3 && !trialSelected ? 2 : 0);
      return;
    }
    if (exitHref) router.push(exitHref, { transitionTypes: ["nav-back"] });
    else router.back();
  };

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  // Phones: Next on Bundle asks once per meal whether to add extras (the inline panel is desktop-only).
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [addonsAskedFor, setAddonsAskedFor] = useState<string | null>(null);
  const offered = offeredAddons(catalog, selections);
  const goNext = () => {
    const phone = typeof matchMedia === "function" && !matchMedia("(min-width: 640px)").matches;
    if (step === 0 && phone && offered.length > 0 && addonsAskedFor !== selections.mealSizeId) {
      setAddonsAskedFor(selections.mealSizeId);
      setAddonsOpen(true);
      return;
    }
    setStep(step === 0 && !trialSelected ? 2 : 3);
  };
  const addonCount = (selections.addonSelections ?? []).reduce((n, a) => n + a.qty, 0);
  const reduce = useReducedMotion();
  const slide = reduce ? 0 : 24;
  const sign = direction === "forward" ? 1 : -1;
  const spring = reduce ? { duration: 0.15 } : { type: "spring" as const, bounce: 0, duration: 0.4 };

  if (bouncing) return null;
  const invoiceSheet = (
      <Sheet bottom open={invoiceOpen && result != null} onClose={() => setInvoiceOpen(false)} title="Price summary">
        {result && (
          <div className="space-y-3 pb-3">
            <PlanSummary
              baseline={catalog.plans.find((p) => p.key === selections.planKey)?.name}
              mealName={catalog.mealSizes.find((m) => m.publicId === selections.mealSizeId)?.name}
              deliveryName={catalog.frequencies.find((f) => f.key === selections.frequencyKey)?.name}
              eatingDays={selections.eatingDays ?? []}
              weeks={selections.durationWeeks}
              startDate={selections.startDate}
              tiffinCount={result.tiffinCount}
              addons={pickedAddons(catalog, selections)}
            />
            <Invoice result={result} />
          </div>
        )}
      </Sheet>
  );
  const builder = (
    <div className="pb-[calc(var(--bottom-bar-h,7rem)+1rem)] sm:pb-6">
      <SubscribeChrome closeHref={closeHref} onBack={goBack} stepTag={stepLabels[progressIndex]} />

      <Progress steps={CHECKOUT_STEPS} current={0} planParts={stepLabels.length} planAt={progressIndex} planNames={stepLabels} />

      {quote && quoteChanged(quote.picks, selections) && (
        // Same shape as the BestDeal banner, so it reads as an offer to undo, not an error.
        <div className="mb-5 flex items-center gap-2 c-surface rounded-2xl bg-(--primary-wash) py-2 pr-1 pl-3" role="status">
          <p className="min-w-0 flex-1 text-footnote leading-snug text-pretty sm:text-sm">
            <span className="text-foreground font-semibold">Changed from your estimate</span>
            <span className="text-muted-foreground"> · price will differ</span>
          </p>
          <button
            type="button"
            onClick={() => set({ ...quote.picks, startDate: selections.startDate })}
            className={buttonClass({ variant: "primary", className: "relative !min-h-9 h-9 shrink-0 !px-4 !text-footnote before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']" })}
          >
            Use my estimate
          </button>
        </div>
      )}

      {step === 0 ? (
        <div className="mb-6 flex flex-col gap-3">
          <DeliveryCheck />
          {intro}
        </div>
      ) : (
        <div className="mb-6 empty:hidden"><DeliveryCheck onlyWhenChecked /></div>
      )}

      {selections.mealSizeId && !trialSelected && <BestDeal key={step} vary={step === 0 ? "bundle" : step === 2 ? "frequency" : "duration"} catalog={catalog} selections={selections} set={set} />}

      <AnimatePresence mode="popLayout" initial={false} custom={sign}>
        <m.div
          key={step}
          custom={sign}
          initial={{ opacity: 0, x: slide * sign }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -slide * sign }}
          transition={spring}
        >
          <h2 className="mb-6 text-large-title leading-[1.06] font-bold tracking-[-0.03em] text-balance sm:text-[40px]">{questions[progressIndex]}</h2>

          {step === 0 && (
            <div className="flex flex-col gap-6">
              <StepBaseline compact catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} />
              {selections.planKey ? <StepBundle catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} trial={trial} popular={popular[selections.planKey ?? ""] ?? []} /> : null}
            </div>
          )}
          {step === 2 && !trialSelected && <StepSchedule catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} />}
          {step === 3 && (
            <StepDuration
              catalog={catalog}
              selections={selections}
              set={set}
              result={result}
              sameWeekConflict={sameWeekConflict}
              currentPlan={currentPlan}
              minStartDate={minStartDate}
              holidayDates={holidayDates}
              lastTiffin={lastTiffin}
              trial={trialSelected && trial ? { ...trial, weekdays: trialSendDays(trial.weekdays, servesWeekends(catalog, selections), mealAllowedDays(catalog, selections)) } : null}
            />
          )}
        </m.div>
      </AnimatePresence>

      {invoiceSheet}

      <Sheet
        bottom
        open={addonsOpen}
        onClose={() => setAddonsOpen(false)}
        title="Add to every tiffin?"
        footer={
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => {
              setAddonsOpen(false);
              setStep(trialSelected ? 3 : 2);
            }}
          >
            {addonCount > 0 ? "Continue" : "Skip extras"}
          </Button>
        }
      >
        <p className="text-muted-foreground -mt-1 mb-3 text-footnote">Optional extras for your {catalog.mealSizes.find((m) => m.publicId === selections.mealSizeId)?.name ?? "meal"}, billed per tiffin.</p>
        <AddonsPanel bare addons={offered} categoryLabels={catalog.categoryLabels} categoryIcons={catalog.categoryIcons} selections={selections} set={set} className="pb-2" />
      </Sheet>

      {trust ? <TrustLine {...trust} /> : null}

      <BottomBar note={blocked ?? pickedNote} className="sm:sticky sm:mt-6 sm:px-0">
        <Button variant="quiet" size="lg" className="w-28 shrink-0" onClick={goBack}>Back</Button>
        {step < 3 ? (
          <Button variant="primary" size="lg" className="flex-1" disabled={!canNext} onClick={goNext}>Next</Button>
        ) : (
          <Button variant="primary" size="lg" className="flex-1" disabled={!canNext} onClick={deploy}>
            Continue to checkout
          </Button>
        )}
      </BottomBar>
    </div>
  );
  if (signIn && atGate) {
    const meal = catalog.mealSizes.find((x) => x.publicId === selections.mealSizeId)?.name;
    return (
      <div className="pb-[calc(var(--bottom-bar-h,7rem)+1rem)] sm:pb-6">
        <SubscribeChrome closeHref={closeHref} onBack={() => setAtGate(false)} stepTag="Your details" />
        <Progress steps={CHECKOUT_STEPS} current={1} planNames={stepLabels} />
        {result ? (
          // The plan they're saving, in full: what, how many, from when, and the total, with Edit back to the steps.
          <section aria-label="Your plan" className="c-glass-card mb-4 rounded-[20px] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-footnote font-semibold text-muted-foreground">Your plan</p>
                <p className="text-headline leading-tight font-semibold tracking-[-0.02em]">{meal ?? "Your tiffin"}</p>
              </div>
              <button type="button" onClick={() => setInvoiceOpen(true)} className="shrink-0 text-right" aria-label={`$${result.total.toFixed(2)} total. Show the price summary`}>
                <span className="block text-headline font-bold tabular-nums">${result.total.toFixed(2)}</span>
                <span className="block text-caption text-muted-foreground underline-offset-4 hover:underline">Price details</span>
              </button>
            </div>
            <p className="mt-2 text-footnote text-muted-foreground">
              {[`${result.tiffinCount} tiffins`, `${(selections.eatingDays ?? []).length} a week`, selections.startDate ? `starts ${formatDateOnly(selections.startDate, { mode: "short" })}` : null].filter(Boolean).join(", ")}
            </p>
            <button type="button" onClick={() => setAtGate(false)} className="mt-2 text-footnote font-semibold text-primary underline-offset-4 hover:underline">Edit plan</button>
          </section>
        ) : null}
        <div className="mb-6"><DeliveryCheck /></div>
        <IdentityGate
          googleClientId={signIn.googleClientId}
          oauthError={signIn.oauthError}
          defaultReferralCode={signIn.referralCode}
          next="/checkout"
          onBack={() => setAtGate(false)}
          intro={{ title: "Save your plan.", body: "Enter your email and we'll send a 6-digit code. New here? That creates your account." }}
        />
        {trust ? <TrustLine {...trust} /> : null}
        {invoiceSheet}
      </div>
    );
  }
  if (!checkout) return builder;
  // No wrapper animation: the builder and Checkout share the same top bar and bottom bar, so swapping them
  // in one frame keeps both bars still (a transformed wrapper would also drag the fixed phone bar along).
  // Only the step content moves: Checkout slides its Delivery body in on arrival.
  return atCheckout ? (
    <Checkout
      {...checkout}
      closeHref={closeHref}
      handoff={{
        selections,
        origin,
        planSteps: [...stepLabels],
        quoteCodes: quote?.codes,
        quoteCoins: quote?.coins,
        onEditPlan: () => { setAtCheckout(false); window.scrollTo({ top: 0 }); },
      }}
    />
  ) : builder;
}

// Proof next to the button, only what is true: the live Google rating and the plan rules every customer gets.
function TrustLine({ rating, reviews, freeDelivery }: { rating: number; reviews: number; freeDelivery: boolean }) {
  return (
    <ul className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-footnote text-muted-foreground" aria-label="Why customers stay">
      {reviews > 0 ? (
        <li className="flex items-center gap-1">
          <Star aria-hidden className="size-3.5 fill-current text-primary" />
          <span><strong className="font-semibold text-foreground tabular-nums">{rating.toFixed(1)}</strong> from {reviews} Google reviews</span>
        </li>
      ) : null}
      <li className="flex items-center gap-1"><PauseCircle aria-hidden className="size-3.5" />Pause or skip any day</li>
      {freeDelivery ? <li className="flex items-center gap-1"><Truck aria-hidden className="size-3.5" />Free delivery</li> : null}
    </ul>
  );
}

// Everything the estimate priced; the start date is not part of a quote.
function quoteChanged(quoted: WizardSelections, s: WizardSelections): boolean {
  const key = (x: WizardSelections) =>
    JSON.stringify([x.planKey, x.mealSizeId, x.frequencyKey, [...(x.eatingDays ?? [])].sort(), x.durationWeeks, x.addonSelections ?? []]);
  return key(quoted) !== key(s);
}
