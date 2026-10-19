import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { colorVar } from "@/lib/sessions/calendar-events";
import { CATEGORY_LABELS, type PublicClass } from "@/lib/sessions/format";

/** A bookable class in the customer app; the public site's ClassCard needs marketing.css, which /me does not load. */
export function ClassTile({ item }: { item: PublicClass }) {
  const meta = [item.audience, item.groupSize].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className="h-1.5 w-full" style={{ background: colorVar(item.color) }} />
      <span className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-muted-foreground text-xs font-medium">
          {CATEGORY_LABELS[item.category]}
          {item.nextDate ? ` · Next: ${item.nextDate}` : ""}
        </span>
        <span className="font-semibold tracking-tight text-pretty">{item.title}</span>
        {item.scheduleLine || meta ? (
          <span className="text-muted-foreground text-sm">{[item.scheduleLine, meta].filter(Boolean).join(" · ")}</span>
        ) : null}
        {item.summary ? <span className="text-muted-foreground line-clamp-2 text-sm">{item.summary}</span> : null}
        <span className="mt-auto flex items-center justify-between gap-2 pt-2 text-sm font-semibold">
          {item.priceLine}
          {item.sessions.length ? <ArrowRightIcon className="size-4 shrink-0" aria-hidden /> : (
            <span className="text-muted-foreground font-normal">No dates yet</span>
          )}
        </span>
      </span>
    </>
  );
  const cls = "bg-card flex flex-col overflow-hidden rounded-2xl border text-left";
  return item.sessions.length ? (
    <Link href={`/me/book?class=${item.publicId}`} className={`${cls} transition-transform active:scale-[0.98] motion-reduce:transition-none`}>
      {body}
    </Link>
  ) : (
    <div className={`${cls} opacity-70`}>{body}</div>
  );
}
