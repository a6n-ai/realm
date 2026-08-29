import Link from "next/link";

const TAGS: Record<string, string> = { veg: "Classic", "non-veg": "Rotating curries", healthy: "High protein" };

// Plans we show but cannot sell yet. Keyed here rather than on plans.active,
// because active=false drops the row from loadCatalogSnapshot entirely — the
// point is to advertise it, not hide it. Remove the key to open the plan.
const COMING_SOON = new Set(["healthy"]);

export function PlanRows({ plans }: { plans: { key: string; name: string; description: string | null }[] }) {
  return (
    <div className="border-t-[1.5px] border-foreground">
      {plans.map((p, i) => {
        const comingSoon = COMING_SOON.has(p.key);
        const inner = (
          <>
            <div className="flex flex-wrap items-baseline gap-4">
              <span className="text-sm font-semibold text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[clamp(24px,4.6vw,48px)] font-bold tracking-[-1.5px] leading-none">{p.name}</span>
              <span className="text-xs font-semibold tracking-wider text-primary uppercase">{TAGS[p.key] ?? ""}</span>
            </div>
            <div className="flex items-center gap-5">
              <span className="max-w-[320px] text-sm text-muted-foreground">{p.description}</span>
              {comingSoon ? (
                <span className="shrink-0 rounded-full border-[1.5px] border-foreground px-4 py-2 text-xs font-semibold tracking-wider uppercase">
                  Coming soon
                </span>
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground text-lg">→</span>
              )}
            </div>
          </>
        );
        const rowClass = "flex flex-wrap items-center justify-between gap-4 border-b-[1.5px] border-foreground px-2 py-6";

        // A plain div, not a disabled link: /subscribe?plan=<key> stays reachable by
        // URL, so a coming-soon plan must not be keyboard-focusable or announced as a
        // destination — nothing to move ahead to yet.
        return comingSoon ? (
          <div key={p.key} className={`${rowClass} opacity-70`}>{inner}</div>
        ) : (
          <Link
            key={p.key}
            href={`/subscribe?plan=${p.key}`}
            className={`hover-lift ${rowClass} transition-[padding] hover:pl-6`}
          >
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
