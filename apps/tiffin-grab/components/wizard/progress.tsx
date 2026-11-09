import { CalendarCheck, CalendarDays, Check, ClipboardList, CreditCard, Truck, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/reui/stepper";

/** Each step's glyph in its dot (after ReUI c-stepper-36); a finished step shows the tick instead. */
const ICONS: Record<string, LucideIcon> = { Plan: ClipboardList, Tiffin: UtensilsCrossed, Schedule: CalendarDays, Start: CalendarCheck, Delivery: Truck, Payment: CreditCard };

/** Every order flow shows these three; Plan counts its own parts when the flow has several plan steps. */
export const CHECKOUT_STEPS = ["Plan", "Delivery", "Payment"] as const;

/**
 * The order flow's stepper, shared by quick renew, the subscribe wizard and checkout so all three read as one flow.
 * ReUI's Stepper: a numbered dot per step, a green tick once done, saffron for the one in progress. With
 * `planNames` (the wizard's own plan pages, e.g. Tiffin and Schedule) Plan is shown as those steps instead, so
 * the customer sees every screen left before paying. `planAt` is the plan page in progress while `current` is 0.
 * Display only: the triggers are disabled (kept at full strength), moving between steps is the page's Back and Next.
 * Phones get equal columns, so the dots sit evenly whatever the label lengths.
 */
export function Progress({ steps, current, planParts = 1, planAt = planParts - 1, planNames }: { steps: readonly string[]; current: number; planParts?: number; planAt?: number; planNames?: readonly string[] }) {
  const names = planNames && planNames.length > 1 ? [...planNames, ...steps.slice(1)] : [...steps];
  const plan = names.length - steps.length + 1;
  const at = current === 0 ? Math.min(planAt, plan - 1) : current + plan - 1;
  return (
    <nav aria-label="Progress" className="mb-6">
      <Stepper value={at + 1} indicators={{ completed: <Check aria-hidden className="size-3.5" strokeWidth={3} /> }}>
        <StepperNav>
          {names.map((name, i) => (
            <StepperItem key={name} step={i + 1} completed={i < at} disabled className="relative max-sm:flex-1 max-sm:basis-0 sm:not-last:flex-1">
              <StepperTrigger tabIndex={-1} aria-current={i === at ? "step" : undefined} className="disabled:opacity-100 max-sm:w-full flex-col gap-1.5 sm:flex-row sm:gap-2">
                <StepperIndicator className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:ring-4 data-[state=active]:ring-primary/20 data-[state=completed]:bg-(--accent-badge) data-[state=completed]:text-(--accent-badge-foreground) font-semibold tabular-nums">
                  {(() => {
                    const Icon = ICONS[name];
                    return Icon ? <Icon aria-hidden className="size-3.5" strokeWidth={2.25} /> : i + 1;
                  })()}
                </StepperIndicator>
                <StepperTitle className={`text-center text-xs sm:text-sm ${i <= at ? "text-foreground" : "text-muted-foreground"}`}>{name}</StepperTitle>
              </StepperTrigger>
              {/* Phones: equal columns, the line runs from this dot's centre to the next one's (dot is 24px, 6px clear each side). */}
              {/* The leg after the current step is the moving wave; legs already done are solid green. */}
              {i < names.length - 1 ? <StepperSeparator className={`data-[state=completed]:bg-(--accent-badge) max-sm:absolute max-sm:left-[calc(50%+18px)] max-sm:right-[calc(-50%+18px)] max-sm:m-0 sm:mx-1 ${i === at ? "c-step-wave max-sm:top-[8px]" : "max-sm:top-[11px]"}`} /> : null}
            </StepperItem>
          ))}
        </StepperNav>
      </Stepper>
    </nav>
  );
}
