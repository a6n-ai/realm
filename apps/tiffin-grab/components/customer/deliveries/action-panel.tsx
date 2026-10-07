"use client";
import { LifeBuoy, MapPin, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { useState } from "react";
import { Button, Reason } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { humanDate, type TripAction } from "@/lib/deliveries-view";
import { ACTION_LABEL, ACTION_SHORT, type actionModel } from "./action-model";

type Model = ReturnType<typeof actionModel>;
interface Props {
  model: Model;
  layout: "card" | "bar";
  onAction: (a: TripAction) => void;
  onGoTo: (date: string) => void;
  /** "Get help" in the overflow menu. */
  helpHref?: string;
}

/** Edit meal (or Move, for a day that wasn't delivered) is the one primary; the rest are a quiet row. Disabled actions stay tappable and answer in plain words. */
export function TripActions({ model, layout, onAction, onGoTo, helpHref }: Props) {
  const [reason, setReason] = useState<string | null>(null);
  const bar = layout === "bar";
  const fire = (k: TripAction, a: { ok: boolean; why: string | null }) => (a.ok ? (setReason(null), onAction(k)) : setReason(a.why));
  const primary = model.rows.find((r) => r.key === model.primary);
  // Only Move sits beside the primary; the rest (address) and help live behind "•••".
  const others = model.rows.filter((r) => r.key !== model.primary && r.key !== "pick");
  const secondary = others.filter((r) => r.key === "move");
  const overflow = others.filter((r) => r.key !== "move");
  const [menu, setMenu] = useState(false);
  const item = cn(FOCUS, "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[15px] font-medium hover:bg-[var(--muted)] [touch-action:manipulation]");
  const more = (overflow.length > 0 || helpHref) && (
    <Popover.Root open={menu} onOpenChange={setMenu}>
      <Popover.Trigger asChild>
        <Button size={bar ? "lg" : "md"} aria-label="More actions" className={cn("shrink-0", bar ? "px-4" : "px-4")}>
          <MoreHorizontal aria-hidden className="size-5" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" side="top" sideOffset={8} className={cn(FONT, "z-50 w-56 rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--card,#fff)] p-1.5 text-[var(--foreground)] shadow-lg")}>
          {overflow.map((r) => (
            <button key={r.key} type="button" aria-disabled={!r.av.ok || undefined} className={cn(item, !r.av.ok && "opacity-45")} onClick={() => (setMenu(false), fire(r.key, r.av))}>
              <MapPin aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground,#6E6558)]" />
              {ACTION_LABEL[r.key]}
            </button>
          ))}
          {helpHref && (
            <Link href={helpHref} className={item} data-testid="delivery-help" onClick={() => setMenu(false)}>
              <LifeBuoy aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground,#6E6558)]" />
              Get help
            </Link>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );

  if (model.rows.length === 0) {
    if (!model.goTo) return null;
    return (
      <div className={cn(FONT, "space-y-3")}>
        {model.goTo && <Button variant="primary" size="lg" className="w-full" onClick={() => onGoTo(model.goTo!)}>Go to {humanDate(model.goTo)}</Button>}
      </div>
    );
  }
  const btn = (k: TripAction, a: { ok: boolean; why: string | null }, label: string) => (
    <Button
      key={k}
      size={bar ? "lg" : "md"}
      aria-label={ACTION_LABEL[k]}
      aria-disabled={!a.ok || undefined}
      className={cn(bar ? "min-w-0 flex-1 px-1" : "shrink-0 px-5", !a.ok && "opacity-45")}
      onClick={() => fire(k, a)}
    >
      {label}
    </Button>
  );
  // Card layout: a lone secondary action stacked below a full-width primary
  // leaves it stranded on a wide desktop card — put primary + secondaries in
  // one row instead (primary keeps the visual weight via flex-1, secondaries
  // stay content-width), and only fall back to a stacked full-width primary
  // when there is nothing else to sit beside it.
  const cardRow = !bar && secondary.length > 0;
  return (
    <div className={cn(FONT, bar ? "space-y-2" : "space-y-3")}>
      {reason && <div role="status"><Reason>{reason}</Reason></div>}
      <div className={cn("flex gap-2", !bar && !cardRow && "flex-col")}>
        {!primary && model.goTo && <Button variant="primary" size="lg" className={cn("min-w-0 whitespace-nowrap px-3", bar ? "flex-[2]" : cardRow ? "flex-1" : "w-full")} onClick={() => onGoTo(model.goTo!)}>Go to {humanDate(model.goTo)}</Button>}
        {primary && (
          <Button
            variant="primary"
            size="lg"
            aria-label={ACTION_LABEL[primary.key]}
            aria-disabled={!primary.av.ok || undefined}
            className={cn("min-w-0 whitespace-nowrap px-3", bar ? "flex-[2]" : cardRow ? "flex-1" : "w-full", !primary.av.ok && "opacity-45")}
            onClick={() => fire(primary.key, primary.av)}
          >
            {ACTION_SHORT[primary.key]}
          </Button>
        )}
        <div className={cn("flex gap-2", (bar || cardRow) && "contents")}>
          {secondary.map((r) => btn(r.key, r.av, ACTION_SHORT[r.key]))}
          {more}
        </div>
      </div>
    </div>
  );
}
