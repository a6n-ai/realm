import { describe, expect, it } from "vitest";
import { bigint, getTableConfig, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { makeNotificationTables, type NotificationTables } from "./schema";

const users = pgTable("users", { id: bigint("id", { mode: "bigint" }).primaryKey() });
const appEvent = pgEnum("app_event", ["order_placed", "order_paid"]);
const locale = pgEnum("locale", ["en", "fr"]);

const t = makeNotificationTables({ users, appEvent, locale });

// Compile-time guard: an app builds its tables from CONCRETE enums, and every
// package function takes `tables: NotificationTables`. The factory being generic
// means that assignment is the thing most likely to break, and tsc is the only
// place it shows up.
const _assignable: NotificationTables = t;
void _assignable;

function columns(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((c) => c.name).sort();
}

describe("makeNotificationTables", () => {
  it("names the tables as the apps expect", () => {
    expect(getTableConfig(t.notifications).name).toBe("notifications");
    expect(getTableConfig(t.notificationOutbox).name).toBe("notification_outbox");
    expect(getTableConfig(t.notificationPrefs).name).toBe("notification_prefs");
    expect(getTableConfig(t.notificationTemplate).name).toBe("notification_template");
    expect(getTableConfig(t.messageSuppression).name).toBe("message_suppression");
  });

  it("gives the outbox a nullable recipient plus literal address columns", () => {
    const cols = getTableConfig(t.notificationOutbox).columns;
    const byName = new Map(cols.map((c) => [c.name, c]));
    expect(byName.get("recipient_id")!.notNull).toBe(false);
    expect(columns(t.notificationOutbox)).toEqual(
      expect.arrayContaining(["recipient_email", "recipient_phone", "kind", "campaign_id"]),
    );
  });

  it("makes the outbox event nullable so a campaign row needs no event", () => {
    const event = getTableConfig(t.notificationOutbox).columns.find((c) => c.name === "event")!;
    expect(event.notNull).toBe(false);
  });

  it("keys suppression on the address, not a user, and scopes it", () => {
    expect(columns(t.messageSuppression)).toEqual(
      ["address", "app_id", "channel", "created_at", "created_by", "id", "public_id", "reason", "scope"],
    );
  });

  it("carries consent provenance on prefs", () => {
    expect(columns(t.notificationPrefs)).toEqual(
      expect.arrayContaining(["kind", "consent_source", "consent_at"]),
    );
  });
});
