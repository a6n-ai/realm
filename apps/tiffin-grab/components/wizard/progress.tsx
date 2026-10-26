import { Check, ChevronRight, CreditCard, MapPin, UtensilsCrossed } from "lucide-react";

/** Every order flow shows these three; Plan counts its own parts when the flow has several plan steps. */
export const CHECKOUT_STEPS = ["Plan", "Delivery", "Payment"] as const;

const ICONS = [UtensilsCrossed, MapPin, CreditCard];

/**
 * The order flow's stepper, shared by quick renew, the subscribe wizard and checkout so all three read as one
 * Plan · Delivery · Payment flow: an icon tile per step, its name and where it stands, joined by chevrons.
 * `planParts` > 1 is the wizard's own plan steps (Baseline, Bundle, …) and `planAt` the one in progress,
 * shown as "2 of 4" under Plan.
 */
export function Progress({ steps, current, planParts = 1, planAt = planParts - 1 }: { steps: readonly string[]; current: number; planParts?: number; planAt?: number }) {
  return (
    <nav aria-label="Progress" className="mb-6">
      <ol className="flex items-center justify-between gap-1.5 sm:justify-start sm:gap-3">
        {steps.map((name, i) => {
          const done = i < current;
          const now = i === current;
          const Icon = done ? Check : (ICONS[i] ?? MapPin);
          const note = i === 0 && now && planParts > 1 ? `${planAt + 1} of ${planParts}` : done ? "Done" : `Step ${i + 1}`;
          return [
            <li key={name} aria-current={now ? "step" : undefined} className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={`grid size-8 shrink-0 place-items-center rounded-[10px] transition-colors duration-300 ${
                  done ? "bg-primary text-primary-foreground" : now ? "bg-primary/15 text-primary ring-[1.5px] ring-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className={`block truncate text-sm font-semibold ${now || done ? "text-foreground" : "text-muted-foreground"}`}>{name}</span>
                <span className="text-muted-foreground block truncate text-xs tabular-nums">{note}</span>
              </span>
            </li>,
            i < steps.length - 1 && (
              <li key={`${name}-sep`} aria-hidden className="text-muted-foreground shrink-0">
                <ChevronRight className="size-4" />
              </li>
            ),
          ];
        })}
      </ol>
    </nav>
  );
}
