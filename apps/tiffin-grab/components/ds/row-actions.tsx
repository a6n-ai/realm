import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const BTN = cn(
  "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground",
  "transition-[transform,color,background-color] hover:bg-accent hover:text-foreground active:scale-[0.96]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/**
 * Consistent table row action: an icon button with a subtle press/hover motion.
 * Use in the LAST column of any table. `stopPropagation` so it doesn't trigger
 * a clickable row's navigation. Renders a Link (href) or a button (onClick).
 */
export function RowActionButton({
  icon: Icon,
  label,
  href,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const inner = <Icon className="size-4 transition-transform duration-200 group-hover/row:scale-110" />;
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={BTN} onClick={(e) => e.stopPropagation()}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={BTN}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {inner}
    </button>
  );
}

/** Right-aligned container for one or more RowActionButtons. */
export function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-1">{children}</div>;
}
