import { EyeIcon, FlaskConicalIcon, type LucideIcon } from "lucide-react";

// No "use client": the server page renders the legend and the client list renders the tags,
// both from this one map so the legend can't drift from the rows.
export const ORDER_TAGS = {
  trial: { icon: FlaskConicalIcon, label: "Trial", className: "text-amber-600 dark:text-amber-400" },
  lookOut: { icon: EyeIcon, label: "Look out for", className: "text-warn" },
} satisfies Record<string, { icon: LucideIcon; label: string; className: string }>;

/** A small icon after the customer's name; hover shows what it means. */
export function RowTag({ tag, title }: { tag: keyof typeof ORDER_TAGS; title?: string }) {
  const { icon: Icon, label, className } = ORDER_TAGS[tag];
  return (
    <span title={title ?? label} className={`ml-2 inline-flex align-middle ${className}`}>
      <Icon className="size-4" aria-label={label} />
    </span>
  );
}

export function OrderTagsLegend() {
  return (
    <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Icon legend">
      {Object.values(ORDER_TAGS).map(({ icon: Icon, label, className }) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <Icon className={`size-4 ${className}`} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}
