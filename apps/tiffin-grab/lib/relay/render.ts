import { createElement, type ReactElement } from "react";
import { render } from "react-email";
import { appendUnsubscribeFooter, interpolate } from "@relay/engine";
import { TEMPLATES } from "@/emails/transactional";
import { OrderCreatedEmail } from "@/emails/order-created";
import { campaignConfig } from "@/lib/notifications/campaign-config";
import type { RelayStream, RelayTemplateOverride } from "./client";

export const UNSUBSCRIBE_TOKEN = "{{unsubscribe_url}}";

export type RelayRenderRow = { event: string; locale: string; vars: Record<string, unknown>; stream: RelayStream };
export type RenderedEmail = { subject: string; html: string; text: string };

// order_created has no seeded copy in the repo (its element is canonical, its subject lives only in Relay),
// so it needs a Relay override subject to render.
const DEFAULTS = new Map<string, { subject: string | null; element: ReactElement }>([
  ...TEMPLATES.map((t) => [t.event, { subject: t.subject, element: t.element as ReactElement }] as const),
  ["order_created", { subject: null, element: createElement(OrderCreatedEmail) }],
]);

/**
 * The email the engine path would send for this event, with Relay's override applied: subject
 * replaces the code default; enabled=false is "disabled". Marketing mail gets the CASL footer with
 * the unsubscribe token left literal, for Relay to fill at delivery.
 */
export async function renderRelayEmail(
  row: RelayRenderRow,
  override: RelayTemplateOverride | null,
): Promise<RenderedEmail | "disabled"> {
  if (override?.enabled === false) return "disabled";
  const base = DEFAULTS.get(row.event);
  const subject = override?.subject || base?.subject;
  if (!base || !subject) throw new Error(`no email template for ${row.event}`);

  const html = await render(base.element);
  const text = await render(base.element, { plainText: true });
  // Interpolate before the footer: the footer's literal token must survive, and interpolate blanks unknown tokens.
  const out = { subject: interpolate(subject, row.vars), html: interpolate(html, row.vars), text: interpolate(text, row.vars) };
  if (row.stream !== "marketing") return out;

  const config = await campaignConfig();
  if (!config) throw new Error("marketing footer not configured");
  return {
    subject: out.subject,
    ...appendUnsubscribeFooter(out, {
      url: UNSUBSCRIBE_TOKEN,
      sender: config.sender.name,
      address: config.sender.postalAddress,
    }),
  };
}
