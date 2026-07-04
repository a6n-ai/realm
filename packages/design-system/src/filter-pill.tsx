import { cn } from "@realm/ui/cn";

export function FilterPill({
  label, active, count, onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        active ? "bg-primary text-primary-foreground border-transparent" : "bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn("nums rounded-full px-1.5 text-xs", active ? "bg-primary-foreground/20" : "bg-muted")}>{count}</span>
      )}
    </button>
  );
}
