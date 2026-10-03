import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { runSystemCampaign, suppress } from "@relay/engine";
import { db } from "@/db/client";
import { messageSuppression, notificationOutbox, users } from "@/db/schema";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { ensureMenuReminder, MENU_REMINDER_KEY } from "@/lib/notifications/menu-reminder";

const MARK = "menu-reminder-int";
const created: bigint[] = [];
const deps = { db, tables: notificationTables, users: usersRef };

async function makeUser(email: string): Promise<bigint> {
  const [u] = await db.insert(users).values({ name: MARK, email, role: "user", status: "active" }).returning({ id: users.id });
  created.push(u.id);
  return u.id;
}

const rowsFor = (id: bigint) =>
  db.select({ id: notificationOutbox.id }).from(notificationOutbox).where(eq(notificationOutbox.recipientId, id));

afterEach(async () => {
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, created));
  await db.delete(messageSuppression).where(eq(messageSuppression.address, `${MARK}-b@example.test`));
  await db.delete(users).where(inArray(users.id, created));
  created.length = 0;
});

describe("weekly menu reminder (system campaign)", () => {
  it("sends once per customer per week, again next week, and always for a manual run", async () => {
    await ensureMenuReminder();
    const id = await makeUser(`${MARK}-a@example.test`);
    const recipients = [{ userId: id, name: "A" }];

    expect(await runSystemCampaign(deps, MENU_REMINDER_KEY, { runKey: "week:2099-01-05", recipients })).toEqual({ queued: 1 });
    // Pressed again the same week: nobody is mailed twice.
    expect(await runSystemCampaign(deps, MENU_REMINDER_KEY, { runKey: "week:2099-01-05", recipients })).toEqual({ queued: 0 });
    expect(await runSystemCampaign(deps, MENU_REMINDER_KEY, { runKey: "week:2099-01-12", recipients })).toEqual({ queued: 1 });
    expect(await runSystemCampaign(deps, MENU_REMINDER_KEY, { runKey: "manual:1", recipients })).toEqual({ queued: 1 });
    expect(await rowsFor(id)).toHaveLength(3);
  });

  it("skips an unsubscribed address", async () => {
    await ensureMenuReminder();
    const id = await makeUser(`${MARK}-b@example.test`);
    await suppress(db, notificationTables, { address: `${MARK}-b@example.test`, channel: "email", reason: "unsubscribe", scope: "marketing" });
    const r = await runSystemCampaign(deps, MENU_REMINDER_KEY, { runKey: "week:2099-01-05", recipients: [{ userId: id }] });
    expect(r).toEqual({ queued: 0 });
    expect(await rowsFor(id)).toHaveLength(0);
  });
});
