import type { Mailer } from "./mailer";

export const consoleMailer: Mailer = {
  async sendSignInCode(to, code) {
    console.info(`[mail] sign-in code for ${to}: ${code}`);
  },
  async sendInvite(to, link) {
    console.info(`[mail] invite for ${to}: ${link}`);
    return { ok: true, messageId: `console:${Date.now()}` };
  },
  async statusByKeys(keys) {
    return Object.fromEntries(keys.map((k) => [k, "sent" as const]));
  },
};
