import Link from "next/link";

const TAGS: Record<string, string> = { veg: "Classic", "non-veg": "Rotating curries", healthy: "High protein" };

export function PlanRows({ plans }: { plans: { key: string; name: string; description: string | null }[] }) {
  return (
    <div className="border-t-[1.5px] border-foreground">
      {plans.map((p, i) => (
        <Link
          key={p.key}
          href={`/subscribe?plan=${p.key}`}
          className="hover-lift flex flex-wrap items-center justify-between gap-4 border-b-[1.5px] border-foreground px-2 py-6 transition-[padding] hover:pl-6"
        >
          <div className="flex flex-wrap items-baseline gap-4">
            <span className="text-sm font-semibold text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-[clamp(24px,4.6vw,48px)] font-bold tracking-[-1.5px] leading-none">{p.name}</span>
            <span className="text-xs font-semibold tracking-wider text-primary uppercase">{TAGS[p.key] ?? ""}</span>
          </div>
          <div className="flex items-center gap-5">
            <span className="max-w-[320px] text-sm text-muted-foreground">{p.description}</span>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground text-lg">→</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
