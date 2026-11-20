import { Badge } from "@foundry/ui/badge";

export function TrialPill({ className = "" }: { className?: string }) {
  return (
    <Badge variant="neutral" className={`[--ui-badge-tone:var(--color-amber-700)] dark:[--ui-badge-tone:var(--color-amber-300)] text-caption-2 font-semibold tracking-wide uppercase ${className}`}>
      Trial
    </Badge>
  );
}
