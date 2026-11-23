import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services" + "/section-seen.actions", () => ({ markAllReadAction: vi.fn() }));

import type { FeedItem } from "@relay/engine/ui/use-notifications";
import { filterNotifications, notificationTabs } from "../notification-bell";

const item = (publicId: string, event: string | null, read = false): FeedItem => ({
  publicId, event, title: publicId, body: "", href: null, readAt: read ? 1 : null, createdAt: 1,
});

describe("notification bell tabs", () => {
  const items = [
    item("o1", "order_created"),
    item("o2", "order_cancelled", true),
    item("t1", "ticket_created"),
    item("c1", null, true),
  ];

  it("always has All and Unread, then only the categories present, with unread counts", () => {
    expect(notificationTabs(items).map((t) => [t.value, t.unread])).toEqual([
      ["all", 0],
      ["unread", 2],
      ["orders", 1],
      ["support", 1],
      ["marketing", 0],
    ]);
  });

  it("filters by unread and by category; a campaign with no event is marketing", () => {
    expect(filterNotifications(items, "unread").map((n) => n.publicId)).toEqual(["o1", "t1"]);
    expect(filterNotifications(items, "orders").map((n) => n.publicId)).toEqual(["o1", "o2"]);
    expect(filterNotifications(items, "marketing").map((n) => n.publicId)).toEqual(["c1"]);
  });
});
