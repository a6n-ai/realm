import type { ReactElement } from "react";
import { render } from "react-email";
import { appendUnsubscribeFooter, interpolate, renderEmailForEvent } from "@relay/engine";
import { TEMPLATES } from "@/emails/transactional";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { campaignConfig } from "@/lib/notifications/campaign-config";
import type { RelayStream, RelayTemplateOverride } from "./client";

export const UNSUBSCRIBE_TOKEN = "{{unsubscribe_url}}";

export type RelayRenderRow = { event: string; locale: string; vars: Record<string, unknown>; stream: RelayStream };
export type RenderedEmail = { subject: string; html: string; text: string };

// Code copy from the same source the seed renders. Events without it render the stored template, as the engine does.
const CODE_DEFAULTS = new Map<string, { subject: string; element: ReactElement }>(
  TEMPLATES.map((t) => [t.event, { subject: t.subject, element: t.element as ReactElement }]),
);

/**
 * The email the engine path would send for this event, with Relay's override applied: subject
 * replaces the default; enabled=false is "disabled". Marketing mail gets the CASL footer with the
 * unsubscribe token left literal, for Relay to fill at delivery.
 */
export async function renderRelayEmail(
  row: RelayRenderRow,
  override: RelayTemplateOverride | null,
): Promise<RenderedEmail | "disabled"> {
  if (override?.enabled === false) return "disabled";
  const code = CODE_DEFAULTS.get(row.event);
  let out: RenderedEmail;
  if (code) {
    const html = await render(code.element);
    const text = await render(code.element, { plainText: true });
    // Interpolate before the footer: the footer's literal token must survive, and interpolate blanks unknown tokens.
    out = { subject: interpolate(code.subject, row.vars), html: interpolate(html, row.vars), text: interpolate(text, row.vars) };
  } else {
    const stored = await renderEmailForEvent(db, notificationTables, row.event, row.locale, row.vars);
    if (!stored) throw new Error(`no email template for ${row.event}`);
    out = stored;
  }
  if (override?.subject) out.subject = interpolate(override.subject, row.vars);
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
