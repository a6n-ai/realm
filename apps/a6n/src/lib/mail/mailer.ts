import type { Env } from "../../env";
import { consoleMailer } from "./console-mailer";
import { memoryMailer } from "./memory-mailer";
import { RelayMailer } from "./relay-mailer";

// "unknown": Relay returned no status for the key, or the status lookup failed.
export type InviteStatus = "queued" | "sent" | "delivered" | "bounced" | "failed" | "suppressed" | "unknown";

export interface Mailer {
  sendSignInCode(to: string, code: string): Promise<void>;
  sendInvite(
    to: string,
    link: string,
    inviterName: string,
    idempotencyKey: string,
  ): Promise<{ ok: boolean; messageId?: string; error?: string }>;
  statusByKeys(keys: string[]): Promise<Record<string, InviteStatus>>;
}

export class MailUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailUnavailableError";
  }
}

export function mailerFor(env: Pick<Env, "MAILER" | "RELAY" | "RELAY_API_KEY">): Mailer {
  switch (env.MAILER) {
    case "relay":
      if (!env.RELAY) throw new MailUnavailableError("RELAY binding missing");
      if (!env.RELAY_API_KEY) throw new MailUnavailableError("RELAY_API_KEY missing");
      return new RelayMailer(env.RELAY, env.RELAY_API_KEY);
    case "console":
      return consoleMailer;
    case "memory":
      return memoryMailer;
    default:
      throw new MailUnavailableError(`unknown MAILER: ${env.MAILER ?? "(unset)"}`);
  }
}

/** Relay is usable only with both the service binding and its API key. */
export const relayState = (env: Pick<Env, "RELAY" | "RELAY_API_KEY">): "bound" | "missing" =>
  env.RELAY && env.RELAY_API_KEY ? "bound" : "missing";

export type { RelayRpcLike } from "./relay-mailer";
