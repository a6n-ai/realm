import { render } from "react-email";
import { db } from "./client";
import { notificationTemplate } from "./schema";
import { OrderCreatedEmail } from "../emails/order-created";

type Row = typeof notificationTemplate.$inferInsert;

// English defaults. Variables must match EVENT_ENTITY in
// lib/notifications/event-entities.ts. Without these rows the matching channel
// does not send (DB template is the sole source of truth). Rich emails are
// authored as react-email components in apps/web/emails and rendered to HTML
// here; {{order.*}} tokens stay literal through render(), interpolated at send.
async function buildSeed(): Promise<Row[]> {
  const orderCreatedHtml = await render(<OrderCreatedEmail />);
  const orderCreatedText = await render(<OrderCreatedEmail />, { plainText: true });
  return [
  {
    event: "order_created", channel: "in_app", locale: "en",
    subject: "Order {{order.code}} received",
    body: "We received your order **{{order.code}}**, {{order.customerName}}.",
  },
  {
    event: "order_created", channel: "email", locale: "en",
    subject: "Order {{order.code}} received",
    body: orderCreatedHtml,
    html: orderCreatedHtml,
    text: orderCreatedText,
  },
  {
    event: "order_activated", channel: "email", locale: "en",
    subject: "Your Tiffin Grab order {{order.code}} is active",
    body: "<h1>Welcome aboard, {{order.customerName}}!</h1><p>Your {{order.planType}} plan ({{order.code}}) is active. First delivery on {{order.startDate}}. Total: {{order.total}}.</p>",
    html: "<h1>Welcome aboard, {{order.customerName}}!</h1><p>Your {{order.planType}} plan ({{order.code}}) is active. First delivery on {{order.startDate}}. Total: {{order.total}}.</p>",
    text: "Welcome aboard, {{order.customerName}}! Your {{order.planType}} plan ({{order.code}}) is active. First delivery on {{order.startDate}}. Total: {{order.total}}.",
  },
  {
    event: "order_activated", channel: "in_app", locale: "en",
    subject: "Order {{order.code}} active",
    body: "Your {{order.planType}} plan starts {{order.startDate}}.",
  },
  {
    event: "menu_released", channel: "email", locale: "en",
    subject: "This week's menu is live",
    body: "<h1>This week's menu is ready</h1><p>Pick your meals for the week starting <strong>{{menuWeek.weekStartIso}}</strong> before {{menuWeek.cutoffLabel}}.</p>",
    html: "<h1>This week's menu is ready</h1><p>Pick your meals for the week starting <strong>{{menuWeek.weekStartIso}}</strong> before {{menuWeek.cutoffLabel}}.</p>",
    text: "This week's menu is ready. Pick your meals for the week starting {{menuWeek.weekStartIso}} before {{menuWeek.cutoffLabel}}.",
  },
  {
    event: "menu_released", channel: "in_app", locale: "en",
    subject: "Menu live",
    body: "Pick meals for {{menuWeek.weekStartIso}} before {{menuWeek.cutoffLabel}}.",
  },
  {
    event: "payment_received", channel: "email", locale: "en",
    subject: "Payment received",
    body: "<p>We received your payment of <strong>{{payment.amount}}</strong> for order {{payment.orderCode}}.</p>",
    html: "<p>We received your payment of <strong>{{payment.amount}}</strong> for order {{payment.orderCode}}.</p>",
    text: "We received your payment of {{payment.amount}} for order {{payment.orderCode}}.",
  },
  {
    event: "ticket_reply", channel: "in_app", locale: "en",
    subject: "Reply on ticket {{ticket.code}}",
    body: "New reply on **{{ticket.subject}}**.",
  },
  ];
}

async function main() {
  const seed = await buildSeed();
  for (const t of seed) {
    await db.insert(notificationTemplate).values(t).onConflictDoUpdate({
      target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale],
      set: { subject: t.subject, body: t.body ?? null, html: t.html ?? null, text: t.text ?? null },
    });
  }
  console.log(`Seeded ${seed.length} notification templates`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
