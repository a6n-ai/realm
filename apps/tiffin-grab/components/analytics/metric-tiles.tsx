import Link from "next/link";
import { Card } from "@/components/ds";
import { cn } from "@foundry/ui/cn";

export type MetricTile = {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: "default" | "warn" | "bad";
};

const TONE: Record<NonNullable<MetricTile["tone"]>, string> = {
  default: "",
  warn: "text-warn",
  bad: "text-bad",
};

/**
 * Headline metrics as linked tiles.
 *
 * Foundry's StatGrid has no href, and a metric the reader cannot open is a dead
 * end — "12 open complaints" should lead to those twelve. Kept app-local rather
 * than widening the shared component for one consumer.
 */
export function MetricTiles({ items, cols = 3 }: { items: MetricTile[]; cols?: 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4",
        cols === 4 ? "lg:grid-cols-4" : "md:grid-cols-3",
      )}
    >
      {items.map((it) => {
        const body = (
          <Card className="h-full p-4">
            <p className="text-muted-foreground text-xs font-medium">{it.label}</p>
            <p className={cn("nums mt-1 text-2xl font-semibold tabular-nums", TONE[it.tone ?? "default"])}>
              {it.value}
            </p>
            {it.hint ? <p className="text-muted-foreground mt-0.5 text-xs text-pretty">{it.hint}</p> : null}
          </Card>
        );
        return it.href ? (
          <Link key={it.label} href={it.href} className="hover-lift block rounded-xl transition-transform">
            {body}
          </Link>
        ) : (
          <div key={it.label}>{body}</div>
        );
      })}
    </div>
  );
}
