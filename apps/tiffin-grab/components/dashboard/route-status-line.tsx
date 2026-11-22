import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { RouteLine } from "@/lib/optimoroute/route-line";
import { HoverHint } from "@/components/ds/hover-hint";
import { ClockCardRow } from "./clock-card-row";

export function RouteStatusLine({ line, icon, label }: { line: RouteLine; icon: LucideIcon; label: string }) {
  return (
    <HoverHint text={line.hint}>
      <Link href={line.href} prefetch={false} className="block min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ClockCardRow icon={icon} label={line.title ?? label} value={line.label} dot={line.tone} />
      </Link>
    </HoverHint>
  );
}
