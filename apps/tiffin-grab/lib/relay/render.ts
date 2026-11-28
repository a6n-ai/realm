import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { render } from "react-email";
import { appendUnsubscribeFooter, renderEmailForEvent } from "@relay/engine";
import { interpolate } from "@relay/email/interpolate";
import { Lead, MENU_REMINDER, TEMPLATES } from "@/emails/transactional";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { campaignConfig } from "@/lib/notifications/campaign-config";
import type { RelayStream, RelayTemplateOverride } from "./client";

export const UNSUBSCRIBE_TOKEN = "{{unsubscribe_url}}";

export type RelayRenderRow = { event: string; locale: string; vars: Record<string, unknown>; stream: RelayStream };
export type RenderedEmail = { subject: string; html: string; text: string };

type Code = { subject: string; element: ReactElement };
// Code copy from the same source the seed renders. Events without it render the stored template, as the engine does.
const CODE_DEFAULTS = new Map<string, Code>([
  ...TEMPLATES.map((t): [string, Code] => [t.event, { subject: t.subject, element: t.element as ReactElement }]),
  ["menu_reminder", { subject: MENU_REMINDER.subject, element: MENU_REMINDER.element as ReactElement }],
]);

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Customer-typed values reach the HTML as text, so escape every string at any depth. */
function escapeVars(v: unknown): unknown {
  if (typeof v === "string") return v.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
  if (Array.isArray(v)) return v.map(escapeVars);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, escapeVars(x)]));
  return v;
}

/**
 * The email the engine path would send for this event, with Relay's override applied: subject
 * replaces the default; enabled=false is "disabled". Marketing mail gets the CASL footer with the
 * unsubscribe token left literal, for Relay to fill at delivery. No code copy and no stored template: "missing".
 */
export async function renderRelayEmail(
  row: RelayRenderRow,
  override: RelayTemplateOverride | null,
): Promise<RenderedEmail | "disabled" | "missing"> {
  if (override?.enabled === false) return "disabled";
  const code = CODE_DEFAULTS.get(row.event);
  let out: RenderedEmail;
  if (code) {
    // override.intro replaces the Lead paragraph's text; React escapes it in the html. Templates with no Lead ignore it.
    const el = override?.intro ? (withIntro(code.element, override.intro) as ReactElement) : code.element;
    const html = await render(el);
    const text = await render(el, { plainText: true });
    // Interpolate before the footer: the footer's literal token must survive, and interpolate blanks unknown tokens.
    out = {
      subject: interpolate(code.subject, row.vars),
      html: interpolate(html, escapeVars(row.vars) as Record<string, unknown>),
      text: interpolate(text, row.vars),
    };
  } else {
    // The engine renders html and text from the same vars, so render twice: html gets escaped vars, text and subject raw.
    const raw = await renderEmailForEvent(db, notificationTables, row.event, row.locale, row.vars);
    const safe = await renderEmailForEvent(db, notificationTables, row.event, row.locale, escapeVars(row.vars) as Record<string, unknown>);
    if (!raw || !safe) return "missing";
    out = { subject: raw.subject, html: safe.html, text: raw.text };
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

// Context would be simpler, but these templates are imported by server code, where createContext does not exist.
function withIntro(node: ReactNode, intro: string): ReactNode {
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  if (node.type === Lead) return cloneElement(node, undefined, intro);
  const { children } = node.props;
  return children === undefined ? node : cloneElement(node, undefined, Children.map(children, (c) => withIntro(c, intro)));
}
