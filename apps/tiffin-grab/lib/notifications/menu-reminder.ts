import { and, desc, eq, inArray } from "drizzle-orm";
import { ensureSystemCampaign, runSystemCampaign } from "@relay/engine";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { menuWeeks, orders, users } from "@/db/schema";
import { formatDateOnly } from "@/lib/format/datetime";
import { notificationTables, usersRef } from "./tables";
import { signalOutbox } from "./outbox-signal";
import { MENU_REMINDER } from "@/emails/transactional";

export const MENU_REMINDER_KEY = "menu_reminder";

// Seeded once from the shared email design; after that staff edit the copy on
// the campaign page. It names no dishes, so the same email works every week.
export async function ensureMenuReminder() {
  return ensureSystemCampaign(
    { db, tables: notificationTables },
    {
      key: MENU_REMINDER_KEY,
      name: "Weekly menu reminder",
      channels: ["email"],
      content: [{ channel: "email", locale: "en", ...(await renderMenuReminder()) }],
    },
  );
}

export async function renderMenuReminder() {
  const { render } = await import("@react-email/components");
  return {
    subject: MENU_REMINDER.subject,
    html: await render(MENU_REMINDER.element),
    text: await render(MENU_REMINDER.element, { plainText: true }),
  };
}

async function releasedWeek(weekPublicId?: string) {
  const [week] = await db
    .select({ weekStart: menuWeeks.weekStart })
    .from(menuWeeks)
    .where(
      weekPublicId
        ? and(eq(menuWeeks.publicId, weekPublicId), eq(menuWeeks.status, "released"))
        : eq(menuWeeks.status, "released"),
    )
    .orderBy(desc(menuWeeks.weekStart))
    .limit(1);
  if (!week) throw new ValidationError(weekPublicId ? "Release this week before sending a reminder" : "No menu week is released yet");
  return week.weekStart;
}

/** Customers with a running plan: the people who have meals to pick. */
async function activeCustomers() {
  const rows = await db
    .selectDistinct({ userId: users.id, name: users.name })
    .from(users)
    .innerJoin(orders, eq(orders.userId, users.id))
    .where(
and(inArray(orders.status, ["active", "paused"]), eq(users.status, "active")),
    );
  return rows.map((r) => ({ userId: r.userId, name: r.name }));
}

async function run(weekStart: string, runKey: string, recipients: { userId: bigint; name: string | null }[]) {
  await ensureMenuReminder();
  const base = process.env.CAMPAIGN_BASE_URL ?? process.env.SITE_URL ?? "";
  const url = new URL("/me/deliveries", base || "https://app.tiffingrab.ca").toString();
  const result = await runSystemCampaign({ db, tables: notificationTables, users: usersRef }, MENU_REMINDER_KEY, {
    runKey,
    recipients,
    href: url,
    vars: { weekLabel: formatDateOnly(weekStart, { mode: "long" }), url },
  });
  if ("error" in result) throw new ValidationError(result.error);
  signalOutbox();
  return result;
}

/** Bulk send for a released week. Once per customer per week, however often it is pressed. */
export async function sendMenuReminderForWeek(weekPublicId: string) {
  const weekStart = await releasedWeek(weekPublicId);
  return run(weekStart, `week:${weekStart}`, await activeCustomers());
}

/**
 * One customer, latest released week. Staff press this deliberately, so it
 * always sends (no per-week dedupe) — but still never to an unsubscribed or
 * bounced address.
 */
export async function sendMenuReminderToCustomer(userPublicId: string) {
  const weekStart = await releasedWeek();
  const [u] = await db
    .select({ userId: users.id, name: users.name })
    .from(users)
    .where(eq(users.publicId, userPublicId));
  if (!u) throw new ValidationError("Customer not found");
  return run(weekStart, `manual:${Date.now()}`, [u]);
}
