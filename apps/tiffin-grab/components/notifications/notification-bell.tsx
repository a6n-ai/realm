"use client";

import Link from "next/link";
import { BellIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@realm/ui/popover";
import { ScrollArea } from "@realm/ui/scroll-area";
import { Separator } from "@realm/ui/separator";
import { cn } from "@/lib/utils";
import { useNotifications } from "./use-notifications";

function timeAgo(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function NotificationBell() {
  const { items, unread, markAllRead } = useNotifications();

  return (
    <Popover onOpenChange={(open) => open && markAllRead()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <BellIcon data-icon="inline-start" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 text-sm font-medium">Notifications</div>
        <Separator />
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const row = (
                  <div className={cn("px-3 py-2.5", !n.readAt && "bg-muted/40")}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.body}</p>
                  </div>
                );
                return (
                  <li key={n.publicId}>
                    {n.href ? (
                      <Link href={n.href} className="block hover:bg-accent">
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
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
