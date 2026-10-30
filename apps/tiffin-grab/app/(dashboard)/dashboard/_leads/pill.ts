import { cn } from "@foundry/ui/cn";

/** One toggle pill for every choice in the lead/order forms: same height, radius and selected look. */
export function pillClass(on: boolean, className?: string) {
  return cn(
    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
    on ? "border-primary bg-primary/10 text-foreground font-medium" : "border-input text-muted-foreground hover:bg-muted hover:text-foreground",
    className,
  );
}
