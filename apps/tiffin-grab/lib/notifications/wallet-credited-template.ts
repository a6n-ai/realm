import { notificationTemplate } from "../../db/schema";
import { BRAND_COMPACT } from "@/lib/brand";
import { emailBaseUrl } from "@/lib/runtime/env";

export const DEFAULT_GRANT_REASON = "Staff gift";

const SUBJECT = `You've got {{wallet.coins}} ${BRAND_COMPACT} coins`;
const BODY = "{{wallet.reason}} — we've added {{wallet.coins}} coins to your wallet. Use them at checkout on your next plan.";

// Only wallet tokens are filled here; campaign merge tokens ({{contact.first_name|there}}) must reach the editor untouched.
export const fillWalletTokens = (t: string, coins: number, reason: string) =>
  t.replace(/\{\{\s*wallet\.(coins|reason)\s*(?:\|[^}]*)?\}\}/g, (_m, k: string) => (k === "coins" ? String(coins) : reason));

/** Rendered title/body for the outbox row; a saved wallet_credited template overrides them at render time. */
export function walletCreditedDefaults(coins: number, reason: string) {
  return { title: fillWalletTokens(SUBJECT, coins, reason), body: fillWalletTokens(BODY, coins, reason) };
}

type SeedDb = Pick<typeof import("../../db/client").db, "insert">;

/** Inserts the in_app + email wallet_credited rows when missing; never overwrites staff edits. */
export async function seedWalletCreditedTemplates(db: SeedDb): Promise<void> {
  const base = { event: "wallet_credited" as never, locale: "en" as const, enabled: true };
  const url = `${emailBaseUrl()}/me/wallet`;
  const html = `<p>Hi {{contact.first_name|there}},</p><p>${BODY}</p><p><a href="${url}">View your wallet</a></p>`;
  await db
    .insert(notificationTemplate)
    .values([
      { ...base, channel: "in_app" as const, subject: SUBJECT, body: BODY },
      { ...base, channel: "email" as const, subject: SUBJECT, body: html, html, text: `${BODY}\n\n${url}` },
    ])
    .onConflictDoNothing({ target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale] });
}
