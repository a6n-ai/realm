"use client";

import Link from "next/link";
import { BellIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Separator } from "@foundry/ui/separator";
import { cn } from "@foundry/ui/cn";
import { useNotifications, type UseNotificationsOptions } from "@relay/engine/ui";

function timeAgo(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Same scroll fix as tiffin-grab — Radix ScrollArea table layout overflow. */
export function NotificationBell(props: UseNotificationsOptions = {}) {
  const { items, unread, markAllRead } = useNotifications(props);

  return (
    <Popover onOpenChange={(open) => open && markAllRead()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <BellIcon className="size-4" />
          {unread > 0 ? (
            <span className="bg-[var(--xl-pink-600)] text-white absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-50 w-80 overflow-hidden p-0">
        <div className="px-3 py-2 text-sm font-semibold">Notifications</div>
        <Separator />
        <div className="bg-popover max-h-96 min-h-0 overflow-y-auto overscroll-contain">
          {items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">You&apos;re all caught up.</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const row = (
                  <div className={cn("px-3 py-2.5", !n.readAt && "bg-muted/40")}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 text-sm font-medium">{n.title}</span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 break-words text-sm">{n.body}</p>
                  </div>
                );
                return (
                  <li key={n.publicId}>
                    {n.href ? (
                      <Link href={n.href} prefetch={false} className="hover:bg-accent block">
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
