"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon, CheckCheckIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Separator } from "@foundry/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { cn } from "@foundry/ui/cn";
import { useNotifications, type FeedItem, type UseNotificationsOptions } from "@relay/engine/ui/use-notifications";
import { CATEGORY_LABEL, EVENT_CATEGORIES, type EventCategory } from "@/lib/notifications/event-categories";
import { eventCategory } from "@/lib/notifications/events";
import { markAllReadAction } from "@/lib/services/section-seen.actions";

const ENDPOINT = "/api/notifications";

function timeAgo(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

type Tab = "all" | "unread" | EventCategory;

// A campaign notification has no business event; it is marketing.
const categoryOf = (n: FeedItem): EventCategory => (n.event ? eventCategory(n.event) : "marketing");

/** Tabs to show: All and Unread always, then each category that has items, in the shared order. */
export function notificationTabs(items: FeedItem[]): { value: Tab; label: string; unread: number }[] {
  const unreadIn = (pick: (n: FeedItem) => boolean) => items.filter((n) => !n.readAt && pick(n)).length;
  const present = new Set(items.map(categoryOf));
  return [
    { value: "all", label: "All", unread: 0 },
    { value: "unread", label: "Unread", unread: unreadIn(() => true) },
    ...EVENT_CATEGORIES.filter((c) => present.has(c)).map((c) => ({
      value: c,
      label: CATEGORY_LABEL[c],
      unread: unreadIn((n) => categoryOf(n) === c),
    })),
  ];
}

export function filterNotifications(items: FeedItem[], tab: Tab): FeedItem[] {
  if (tab === "all") return items;
  if (tab === "unread") return items.filter((n) => !n.readAt);
  return items.filter((n) => categoryOf(n) === tab);
}

// Relay's NotificationBell scrolls with Radix ScrollArea. That viewport's child
// is `display: table`, so `max-h-96` never becomes a scrollport — the rows paint
// outside the popover and sit on top of whatever is underneath (activity
// timestamps, the Filter control, the log table).
export function NotificationBell(props: UseNotificationsOptions = {}) {
  const { items, unread, markAllRead, refresh } = useNotifications({ endpoint: ENDPOINT, ...props });
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("all");
  const tabs = notificationTabs(items);
  // A category tab disappears when its last item goes; fall back to All rather than an empty list.
  const active: Tab = tabs.some((t) => t.value === tab) ? tab : "all";
  const shown = filterNotifications(items, active);

  const markOne = (n: FeedItem) => {
    if (n.readAt) return;
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicIds: [n.publicId] }),
    }).then(() => refresh());
  };

  // One "Mark all read" for the feed and the sidebar's section dots.
  const markEverything = () => {
    void markAllRead();
    void markAllReadAction().then(() => router.refresh());
  };

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label="Notifications" />}>
        <BellIcon data-icon="inline-start" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-caption-2 font-medium leading-none text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="z-50 w-96 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <Button variant="ghost" size="sm" onClick={markEverything}>
            <CheckCheckIcon data-icon="inline-start" />
            Mark all read
          </Button>
        </div>
        <Tabs value={active} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
          <TabsList variant="line" aria-label="Notification type" className="w-full justify-start px-3">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-none">
                {t.label}
                {t.unread > 0 && <span className="text-muted-foreground tabular-nums">{t.unread}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Separator />
        <div className="max-h-96 min-h-0 overflow-y-auto overscroll-contain bg-popover">
          {shown.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {active === "unread" || items.length === 0 ? "You're all caught up." : "Nothing here yet."}
            </p>
          ) : (
            <ul className="divide-y">
              {shown.map((n) => {
                const row = (
                  <div className={cn("px-3 py-2.5", !n.readAt && "bg-muted/40")}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                        {!n.readAt && <span aria-label="Unread" className="size-1.5 shrink-0 rounded-full bg-primary" />}
                        {n.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 break-words text-sm text-muted-foreground">{n.body}</p>
                  </div>
                );
                return (
                  <li key={n.publicId}>
                    {n.href ? (
                      <Link href={n.href} prefetch={false} className="block transition-colors hover:bg-accent" onClick={() => markOne(n)}>
                        {row}
                      </Link>
                    ) : (
                      <button type="button" className="block w-full text-left transition-colors hover:bg-accent" onClick={() => markOne(n)}>
                        {row}
                      </button>
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
