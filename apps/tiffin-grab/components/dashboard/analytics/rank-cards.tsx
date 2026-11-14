import Link from "next/link";
import { Card, CardContent } from "@foundry/ui/card";
import { cn } from "@foundry/ui/cn";
import { Badge } from "@/components/reui/badge";

export type RankItem = {
  rank: number;
  title: string;
  value: string;
  meta?: string[];
  /** CSS colour (a chart token) for a dot before the title. */
  dot?: string;
  href?: string;
};

const COLS = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
  5: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-5",
} as const;

/** Ranked entities as small cards: rank badge, name, one big number, a few meta lines. */
export function RankCards({ items, cols = 2, size = "default" }: { items: RankItem[]; cols?: keyof typeof COLS; size?: "default" | "sm" }) {
  const sm = size === "sm";
  return (
    <div className={cn("grid gap-3", COLS[cols])}>
      {items.map((it) => {
        const card = (
          <Card size={size} className={cn("h-full", it.href && "hover:bg-muted/50 transition-colors")}>
            <CardContent className={cn("flex flex-col items-start", sm ? "gap-1" : "gap-2")}>
              {sm ? null : <Badge variant="secondary">#{it.rank}</Badge>}
              <span className="flex w-full items-center gap-2 text-sm font-medium">
                {sm ? <Badge variant="secondary">#{it.rank}</Badge> : null}
                {it.dot ? <span className="size-2.5 shrink-0 rounded-full" style={{ background: it.dot }} /> : null}
                <span className="truncate" title={it.title}>{it.title}</span>
              </span>
              <span className={cn("font-semibold tabular-nums", sm ? "text-xl" : "text-3xl")}>{it.value}</span>
              {it.meta?.map((m) => (
                <span key={m} className="text-muted-foreground w-full truncate text-xs">
                  {m}
                </span>
              ))}
            </CardContent>
          </Card>
        );
        return it.href ? (
          <Link key={it.rank} href={it.href} className="focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-2">
            {card}
          </Link>
        ) : (
          <div key={it.rank}>{card}</div>
        );
      })}
    </div>
  );
}
