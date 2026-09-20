import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-2xl bg-[var(--muted)] motion-reduce:animate-none", className)} />;
}
