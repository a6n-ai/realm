import type { Mailer } from "./mailer";

export type SentMail =
  | { kind: "code"; to: string; code: string }
  | { kind: "invite"; to: string; link: string; inviterName: string; idempotencyKey: string };

export function createMemoryMailer(): Mailer & {
  sent: SentMail[];
  lastCode(email: string): string | undefined;
  failInvites(fail: boolean): void;
} {
  const sent: SentMail[] = [];
  let failing = false;
  return {
    sent,
    lastCode(email) {
      for (let i = sent.length - 1; i >= 0; i--) {
        const m = sent[i]!;
        if (m.kind === "code" && m.to === email) return m.code;
      }
      return undefined;
    },
    failInvites(fail) {
      failing = fail;
    },
    async sendSignInCode(to, code) {
      sent.push({ kind: "code", to, code });
    },
    async sendInvite(to, link, inviterName, idempotencyKey) {
      if (failing) return { ok: false, error: "memory mailer: invite failure" };
      sent.push({ kind: "invite", to, link, inviterName, idempotencyKey });
      return { ok: true, messageId: `mem_${sent.length}` };
    },
    async statusByKeys(keys) {
      return Object.fromEntries(keys.map((k) => [k, "sent" as const]));
    },
  };
}

export const memoryMailer = createMemoryMailer();
