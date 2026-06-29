import { db } from "./client";
import { notificationTemplate } from "./schema";

type Row = typeof notificationTemplate.$inferInsert;

// English defaults. Variables must match EVENT_ENTITY in
// lib/notifications/event-entities.ts. Without these rows the matching channel
// does not send (DB template is the sole source of truth).
const SEED: Row[] = [
  {
    event: "order_created", channel: "in_app", locale: "en",
    subject: "Order {{order.code}} received",
    body: "We received your order **{{order.code}}**, {{order.customerName}}.",
  },
  {
    event: "order_activated", channel: "email", locale: "en",
    subject: "Your Tiffin Grab order {{order.code}} is active",
    body: "# Welcome aboard, {{order.customerName}}!\n\nYour **{{order.planType}}** plan ({{order.code}}) is active. First delivery on {{order.startDate}}.\n\nTotal: {{order.total}}",
  },
  {
    event: "order_activated", channel: "in_app", locale: "en",
    subject: "Order {{order.code}} active",
    body: "Your {{order.planType}} plan starts {{order.startDate}}.",
  },
  {
    event: "menu_released", channel: "email", locale: "en",
    subject: "This week's menu is live",
    body: "# This week's menu is ready\n\nPick your meals for the week starting **{{menuWeek.weekStartIso}}** before {{menuWeek.cutoffLabel}}.",
  },
  {
    event: "menu_released", channel: "in_app", locale: "en",
    subject: "Menu live",
    body: "Pick meals for {{menuWeek.weekStartIso}} before {{menuWeek.cutoffLabel}}.",
  },
  {
    event: "payment_received", channel: "email", locale: "en",
    subject: "Payment received",
    body: "We received your payment of **{{payment.amount}}** for order {{payment.orderCode}}.",
  },
  {
    event: "ticket_reply", channel: "in_app", locale: "en",
    subject: "Reply on ticket {{ticket.code}}",
    body: "New reply on **{{ticket.subject}}**.",
  },
];

async function main() {
  for (const t of SEED) {
    await db.insert(notificationTemplate).values(t).onConflictDoNothing({
      target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale],
    });
  }
  console.log(`Seeded ${SEED.length} notification templates`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
