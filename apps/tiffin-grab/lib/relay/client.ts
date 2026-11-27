import { cfEnv, type CfEnv } from "@/lib/runtime/cf-env";

// Shapes copied by hand from relay-v2 (src/rpc/relay-rpc.ts, src/core/send-input.ts, src/do/templates.ts).
// Keep in step with Relay; do not import Relay code.
export type RelayStream = "transactional" | "tracked" | "marketing";
export type RelayStatus = "queued" | "sent" | "failed" | "suppressed";

export type RelaySendInput = {
  stream: RelayStream;
  /** Omitted: Relay uses the app's default sender for the stream, with its name and reply-to. */
  from?: string;
  /** ≤100 chars. */
  fromName?: string;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  event?: string;
  idempotencyKey?: string;
  /** ≤3 files, each ≤5 MB decoded. */
  attachments?: { filename: string; contentType: string; content: string }[];
};
export type RelaySendResult = { messageId: string; status: RelayStatus; duplicate: boolean };

export type RelayTemplateOverride = {
  event: string | null;
  locale: string;
  subject: string;
  intro: string | null;
  enabled: boolean;
};

export type RelayMessageByKey = {
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

export type RelaySuppressionStatus = {
  email: string;
  stream: string | null;
  reason: "unsubscribe" | "bounce" | "complaint" | "manual";
  brandOptOut: boolean;
};

/** Every method takes the app's key bound: callers never pass apiKey. */
export interface RelayClient {
  send(input: RelaySendInput): Promise<RelaySendResult>;
  templateOverrides(): Promise<RelayTemplateOverride[]>;
  messagesByKeys(keys: string[]): Promise<RelayMessageByKey[]>;
  suppressionStatus(emails: string[]): Promise<RelaySuppressionStatus[]>;
  suppress(input: { email: string; reason: "unsubscribe" | "manual"; stream: "marketing" | null }): Promise<{ created: boolean }>;
  /** True when Relay holds an opt-out, bounce or complaint for this address on this stream; `from` scopes brand opt-outs. */
  isSuppressed(email: string, stream: "marketing", from?: string): Promise<boolean>;
  /** Relay's MessageView, not copied: no caller reads it yet. */
  getMessage(id: string): Promise<unknown>;
}

let testClient: RelayClient | null = null;
export function setRelayClientForTests(client: RelayClient | null): void {
  testClient = client;
}

// Off Workers (next dev, tests) there is no Cloudflare context, so there is no binding.
function bindings(): Partial<CfEnv> {
  try {
    return cfEnv();
  } catch {
    return {};
  }
}

export function relayRpc(): RelayClient {
  if (testClient) return testClient;
  const env = bindings();
  const rpc = env.RELAY;
  if (!rpc) throw new Error("relay binding missing");
  const apiKey = env.RELAY_API_KEY ?? "";
  const call = <T>(method: string, ...args: unknown[]) => rpc[method]!(apiKey, ...args) as Promise<T>;
  return {
    send: (input) => call("send", input),
    templateOverrides: () => call("templateOverrides"),
    messagesByKeys: (keys) => call("messagesByKeys", keys),
    suppressionStatus: (emails) => call("suppressionStatus", emails),
    suppress: (input) => call("suppress", input),
    isSuppressed: (email, stream, from) => call("isSuppressed", email, stream, from),
    getMessage: (id) => call("getMessage", id),
  };
}
