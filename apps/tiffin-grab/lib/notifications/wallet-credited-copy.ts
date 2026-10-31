import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTemplate } from "@/db/schema";
import { DEFAULT_GRANT_REASON, walletCreditedDefaults } from "./wallet-credited-template";

export { DEFAULT_GRANT_REASON, walletCreditedDefaults };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Only wallet tokens are filled here; campaign merge tokens ({{contact.first_name|there}}) must reach the editor untouched.
const fill = (t: string, coins: number, reason: string) =>
  t.replace(/\{\{\s*wallet\.(coins|reason)\s*(?:\|[^}]*)?\}\}/g, (_m, k: string) => (k === "coins" ? String(coins) : reason));

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
  if (email) {
    return { subject: fill(email.subject, coins, reason), html: fill((email.html ?? email.body)!, coins, esc(reason)) };
  }
  const copy = inApp
    ? { title: inApp.subject, body: inApp.body! }
    : walletCreditedDefaults(coins, reason);
  const paragraphs = fill(copy.body, coins, reason).split(/\n{2,}/).map((p) => `<p>${esc(p.trim())}</p>`);
  return { subject: fill(copy.title, coins, reason), html: `<p>Hi {{contact.first_name|there}},</p>${paragraphs.join("")}` };
}
