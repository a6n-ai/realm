import { interpolate } from "@relay/engine";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTemplate } from "@/db/schema";
import { DEFAULT_GRANT_REASON, walletCreditedDefaults } from "./wallet-credited-template";

export { DEFAULT_GRANT_REASON, walletCreditedDefaults };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Campaign merge variables must survive interpolation, so they map to themselves.
const MERGE = {
  contact: { name: "{{contact.name}}", first_name: "{{contact.first_name}}", last_name: "{{contact.last_name}}", email: "{{contact.email}}" },
};

/**
 * Subject + HTML for a group coin email: the same wallet_credited copy a single-customer grant sends.
 * Prefers the saved email template, then the in-app one, then the enqueue defaults.
 */
export async function walletCreditedEmailDraft(coins: number, reason: string): Promise<{ subject: string; html: string }> {
  const rows = await db
    .select()
    .from(notificationTemplate)
    .where(and(eq(notificationTemplate.event, "wallet_credited"), eq(notificationTemplate.locale, "en"), eq(notificationTemplate.enabled, true)));
  const email = rows.find((r) => r.channel === "email" && (r.html || r.body));
  const inApp = rows.find((r) => r.channel === "in_app" && r.body);
  const vars = (escape: boolean) => ({ ...MERGE, wallet: { coins: String(coins), reason: escape ? esc(reason) : reason } });

  if (email) {
    return { subject: interpolate(email.subject, vars(false)), html: interpolate((email.html ?? email.body)!, vars(true)) };
  }
  const copy = inApp
    ? { title: inApp.subject, body: inApp.body! }
    : walletCreditedDefaults(coins, reason);
  const subject = interpolate(copy.title, vars(false));
  const paragraphs = interpolate(copy.body, vars(false)).split(/\n{2,}/).map((p) => `<p>${esc(p.trim())}</p>`);
  return { subject, html: paragraphs.join("") };
}
