import { cn } from "@realm/ui/cn";
import type { PlanTag } from "@/lib/services/dishes.service";

/**
 * The plan tags a dish carries, rendered verbatim from admin-configured label
 * and colour. This replaced the hardcoded veg/non-veg dot: nothing here decides
 * what a dish *is*, so renaming a plan or adding one needs no code change.
 *
 * `dots` renders colour only (for tight photo corners); the default renders
 * colour + label.
 */
export function PlanTags({
  tags,
  dots = false,
  className,
}: {
  tags: PlanTag[] | undefined;
  dots?: boolean;
  className?: string;
}) {
  // Tolerate undefined: a dish read that predates plan tags must not blank the page.
  if (!tags?.length) return null;

  if (dots) {
    return (
      <span className={cn("flex items-center gap-1", className)}>
        {tags.map((t) => (
          <span
            key={t.label}
            aria-label={t.label}
            title={t.label}
            className="size-2.5 rounded-full ring-2 ring-white/80"
            style={{ backgroundColor: t.color }}
          />
        ))}
      </span>
    );
  }

  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tags.map((t) => (
        <span
          key={t.label}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
          style={{ borderColor: `${t.color}59`, color: t.color, backgroundColor: `${t.color}14` }}
        >
          <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: t.color }} />
          {t.label}
        </span>
      ))}
    </span>
  );
}
