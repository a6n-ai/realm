import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { RouteLine } from "@/lib/optimoroute/route-line";
import { HoverHint } from "@/components/ds/hover-hint";
import { CardRow } from "./clock-card-row";

export function RouteStatusLine({ line, icon, label }: { line: RouteLine; icon: LucideIcon; label: string }) {
  return (
    <HoverHint text={line.hint}>
      <Link href={line.href} prefetch={false} className="hover:text-foreground block min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CardRow icon={icon} label={label} dot={line.tone}>
          {line.label}
        </CardRow>
      </Link>
    </HoverHint>
  );
}
