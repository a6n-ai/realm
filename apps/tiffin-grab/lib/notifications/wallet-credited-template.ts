import { notificationTemplate } from "../../db/schema";

export const DEFAULT_GRANT_REASON = "Staff gift";

/** Rendered title/body for the outbox row; a saved wallet_credited template overrides them at render time. */
export function walletCreditedDefaults(coins: number, reason: string) {
  return {
    title: `You've got ${coins} TiffinGrab coins`,
    body: `${reason} — we've added ${coins} coins to your wallet. Use them at checkout on your next plan.`,
  };
}

const BASE = process.env.EMAIL_BASE_URL ?? "https://app.tiffingrab.ca";
const SUBJECT = "You've got {{wallet.coins}} TiffinGrab coins";
const BODY = "{{wallet.reason}} — we've added {{wallet.coins}} coins to your wallet. Use them at checkout on your next plan.";
const HTML = `<p>Hi {{contact.first_name|there}},</p><p>${BODY}</p><p><a href="${BASE}/me/wallet">View your wallet</a></p>`;

type SeedDb = Pick<typeof import("../../db/client").db, "insert">;

/** Inserts the in_app + email wallet_credited rows when missing; never overwrites staff edits. */
export async function seedWalletCreditedTemplates(db: SeedDb): Promise<void> {
  const base = { event: "wallet_credited" as never, locale: "en" as const, enabled: true };
  await db
    .insert(notificationTemplate)
    .values([
      { ...base, channel: "in_app" as const, subject: SUBJECT, body: BODY },
      { ...base, channel: "email" as const, subject: SUBJECT, body: HTML, html: HTML, text: `${BODY}\n\n${BASE}/me/wallet` },
    ])
    .onConflictDoNothing({ target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale] });
}
