"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/http/api-fetch";
import { subscribeNotifications, type RealtimeNotification } from "./realtime";

export interface FeedItem {
  publicId: string;
  event: string;
  title: string;
  body: string;
  href: string | null;
  readAt: number | null;
  createdAt: number;
}

interface FeedResponse {
  items: FeedItem[];
  unread: number;
}

export function useNotifications() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = (await res.json()) as FeedResponse;
    setItems(data.items);
    setUnread(data.unread);
  }, []);

  const markAllRead = useCallback(async () => {
    if (unread === 0) return;
    setUnread(0);
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: Date.now() })));
    // ponytail: user action → surface failures via toast (apiFetch). The focus
    // poll in `refresh` stays silent on purpose so it can't spam toasts.
    await apiFetch("/api/notifications", { method: "POST", body: JSON.stringify({}) });
  }, [unread]);

  // Initial load + refresh when the tab regains focus.
  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Live push: prepend incoming notifications and bump the unread count.
  useEffect(() => {
    let unsub = () => {};
    let active = true;
    const onEvent = (n: RealtimeNotification) => {
      setItems((prev) =>
        prev.some((p) => p.publicId === n.publicId)
          ? prev
          : [{ ...n, readAt: null, createdAt: Date.now() }, ...prev],
      );
      setUnread((u) => u + 1);
    };
    void subscribeNotifications(onEvent).then((fn) => {
      if (active) unsub = fn;
      else fn();
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  return { items, unread, markAllRead, refresh };
}
