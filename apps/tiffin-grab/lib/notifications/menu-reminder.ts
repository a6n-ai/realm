import { and, desc, eq } from "drizzle-orm";
import { ensureSystemCampaign, runSystemCampaign, type EnqueueInput } from "@relay/engine";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { menuWeeks, users } from "@/db/schema";
import { activeCustomers } from "./active-customers";
import { formatDateOnly } from "@/lib/format/datetime";
import { notificationTables, usersRef } from "./tables";
import { signalOutbox } from "./outbox-signal";
import { render } from "react-email";
import { MENU_REMINDER } from "@/emails/transactional";
import { DEFAULT_ORIGIN, campaignBaseUrl, emailViaRelay } from "@/lib/runtime/env";
import { enqueueViaRelay } from "@/lib/relay/enqueue";
import { sentKeysWithPrefix } from "@/lib/relay/delivery-state";

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

export async function runMenuReminder(weekStart: string, runKey: string, recipients: { userId: bigint; name: string | null }[]) {
  const base = campaignBaseUrl() ?? "";
  const url = new URL("/me/deliveries", base || DEFAULT_ORIGIN).toString();
  const vars = { weekLabel: formatDateOnly(weekStart, { mode: "long" }), url };
  if (emailViaRelay()) {
    // Relay path: the code copy renders in forward.ts. The key is the engine's own (cmp:<campaign>:<runKey>:<user>, +":email"
    // from planOutboxRows), so a recipient the engine already reminded this run is skipped and Relay dedupes the rest.
    const { publicId } = await ensureMenuReminder();
    const prefix = `cmp:${publicId}:${runKey}:`;
    const sent = await sentKeysWithPrefix(prefix);
    const inputs: EnqueueInput[] = recipients
      .filter((r) => !sent.has(`${prefix}${r.userId}`))
      .map((r) => ({
        event: MENU_REMINDER_KEY,
        kind: "marketing",
        channels: ["email"],
        recipientId: r.userId,
        title: "",
        body: "",
        data: vars,
        dedupeKey: `${prefix}${r.userId}`,
      }));
    await db.transaction((tx) => enqueueViaRelay(tx, inputs));
    await signalOutbox();
    // enqueueViaRelay does not report counts; Relay drops suppressed addresses after this.
    return { queued: inputs.length };
  }
  await ensureMenuReminder();
  const result = await runSystemCampaign({ db, tables: notificationTables, users: usersRef }, MENU_REMINDER_KEY, {
    runKey,
    recipients,
    href: url,
    vars,
  });
  if ("error" in result) throw new ValidationError(result.error);
  await signalOutbox();
  return result;
}

/** Bulk send for a released week. Once per customer per week, however often it is pressed. */
export async function sendMenuReminderForWeek(weekPublicId: string) {
  const weekStart = await releasedWeek(weekPublicId);
  return runMenuReminder(weekStart, `week:${weekStart}`, await activeCustomers());
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
  return runMenuReminder(weekStart, `manual:${Date.now()}`, [u]);
}
