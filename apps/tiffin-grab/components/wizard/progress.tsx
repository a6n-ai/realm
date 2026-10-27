/** Every order flow shows these three; Plan counts its own parts when the flow has several plan steps. */
export const CHECKOUT_STEPS = ["Plan", "Delivery", "Payment"] as const;

/**
 * The order flow's stepper, shared by quick renew, the subscribe wizard and checkout so all three read as one
 * Plan · Delivery · Payment flow. ReUI's "bar with titles" stepper shape: one segment per step that fills up to
 * where the customer is, name and status under it. `planParts` > 1 is the wizard's own plan steps (Baseline,
 * Bundle, …) and `planAt` the one in progress: Plan's segment fills part by part and reads "2 of 4".
 */
export function Progress({ steps, current, planParts = 1, planAt = planParts - 1 }: { steps: readonly string[]; current: number; planParts?: number; planAt?: number }) {
  return (
    <nav aria-label="Progress" className="mb-6">
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((name, i) => {
          const done = i < current;
          const now = i === current;
          const fill = done ? 1 : !now ? 0 : i === 0 && planParts > 1 ? (planAt + 1) / planParts : 0.5;
          const note = i === 0 && now && planParts > 1 ? `${planAt + 1} of ${planParts}` : done ? "Done" : now ? "Now" : `Step ${i + 1}`;
          return (
            <li key={name} aria-current={now ? "step" : undefined} className="min-w-0">
              <span aria-hidden className="bg-muted block h-1 overflow-hidden rounded-full">
                <span
                  className="bg-primary block h-full origin-left rounded-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  style={{ transform: `scaleX(${fill})` }}
                />
              </span>
              <span className="mt-2 flex items-baseline justify-between gap-2 leading-tight">
                <span className={`truncate text-sm font-semibold ${now || done ? "text-foreground" : "text-muted-foreground"}`}>{name}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{note}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
