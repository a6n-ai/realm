import { type InviteStatus, MailUnavailableError, type Mailer } from "./mailer";
import { readSecret, type SecretValue } from "../secrets";
import { inviteMail, signInCodeMail } from "./templates";

// Copied from apps/tiffin-grab/lib/relay/client.ts, trimmed to send + messagesByKeys.
type RelayStatus = "queued" | "sent" | "failed" | "suppressed";
type RelaySendInput = {
  stream: "transactional" | "marketing";
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
};
type RelaySendResult = { messageId: string; status: RelayStatus; duplicate: boolean };
type RelayMessageByKey = {
  key: string;
  messageId: string;
  status: RelayStatus;
  sentAt: number | null;
  deliveredAt: number | null;
  bouncedAt: number | null;
  complainedAt: number | null;
  opens: number;
  clicks: number;
  error: string | null;
};

export type RelayRpcLike = {
  send(apiKey: string, input: RelaySendInput): Promise<RelaySendResult>;
  messagesByKeys(apiKey: string, keys: string[]): Promise<RelayMessageByKey[]>;
};

export function mapRelayStatus(m: Pick<RelayMessageByKey, "status" | "deliveredAt" | "bouncedAt">): InviteStatus {
  if (m.bouncedAt) return "bounced";
  if (m.deliveredAt) return "delivered";
  return m.status;
}

export class RelayMailer implements Mailer {
  constructor(
    private rpc: RelayRpcLike,
    private key: SecretValue,
  ) {}

  private async apiKey(): Promise<string> {
    const key = await readSecret(this.key);
    if (!key) throw new MailUnavailableError("RELAY_API_KEY missing");
    return key;
  }

  async sendSignInCode(to: string, code: string): Promise<void> {
    await this.rpc.send(await this.apiKey(), { stream: "transactional", to, ...signInCodeMail(code) });
  }

  async sendInvite(to: string, link: string, inviterName: string, idempotencyKey: string) {
    try {
      const r = await this.rpc.send(await this.apiKey(), {
        stream: "transactional",
        to,
        ...inviteMail(link, inviterName),
        idempotencyKey,
      });
      return { ok: true, messageId: r.messageId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async statusByKeys(keys: string[]): Promise<Record<string, InviteStatus>> {
    if (keys.length === 0) return {};
    const rows = await this.rpc.messagesByKeys(await this.apiKey(), keys);
    return Object.fromEntries(rows.map((m) => [m.key, mapRelayStatus(m)]));
  }
}
