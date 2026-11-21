import Link from "next/link";
import type { RouteLine } from "@/lib/optimoroute/route-line";
import { HoverHint } from "@/components/ds/hover-hint";

const DOT = { ok: "bg-success", warn: "bg-warning", muted: "bg-muted-foreground" } as const;

export function RouteStatusLine({ line }: { line: RouteLine }) {
  return (
    <HoverHint text={line.hint}>
      <Link href={line.href} prefetch={false} className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT[line.tone]}`} />
        <span className="truncate">OptimoRoute · {line.label}</span>
      </Link>
    </HoverHint>
  );
}
