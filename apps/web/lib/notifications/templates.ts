import { notificationOutbox } from "@/db/schema";

type Event = (typeof notificationOutbox.event.enumValues)[number];

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface Payload {
  title: string;
  body: string;
  href?: string | null;
  [k: string]: unknown;
}

const APP_URL = process.env.APP_PUBLIC_URL ?? "https://tiffingrab.ca";

/** Minimal branded wrapper around a per-event body + optional CTA. */
function wrap(body: string, href?: string | null): string {
  const cta = href
    ? `<p style="margin:24px 0"><a href="${APP_URL}${href}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View</a></p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 8px">Tiffin Grab</h2>
  ${body}${cta}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="font-size:12px;color:#888">You received this because of activity on your Tiffin Grab account.</p>
</div>`;
}

/**
 * Per-event email templates. Each returns subject/html/text from the outbox
 * payload. Falls back to a generic title/body template for events without a
 * bespoke design yet.
 */
const TEMPLATES: Partial<Record<Event, (p: Payload) => RenderedEmail>> = {
  order_activated: (p) => ({
    subject: `Order confirmed — ${p.title}`,
    text: `${p.body}`,
    html: wrap(`<p><strong>Your order is confirmed.</strong></p><p>${p.body}</p>`, p.href),
  }),
  menu_released: (p) => ({
    subject: `This week's menu is live`,
    text: `${p.body}`,
    html: wrap(`<p><strong>${p.title}</strong></p><p>${p.body}</p><p>Pick your meals before the cutoff.</p>`, p.href),
  }),
  payment_received: (p) => ({
    subject: `Payment received — ${p.title}`,
    text: `${p.body}`,
    html: wrap(`<p>We received your payment.</p><p>${p.body}</p>`, p.href),
  }),
};

function generic(p: Payload): RenderedEmail {
  return {
    subject: p.title,
    text: p.body,
    html: wrap(`<p><strong>${p.title}</strong></p><p>${p.body}</p>`, p.href),
  };
}

export function renderEmail(event: Event, payload: Record<string, unknown>): RenderedEmail {
  const p = payload as Payload;
  return (TEMPLATES[event] ?? generic)(p);
}
