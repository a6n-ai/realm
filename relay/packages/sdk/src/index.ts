export type Channel = "email" | "in_app" | "sms" | "whatsapp";
export type Kind = "transactional" | "marketing";

export interface CreateMessageInput {
  kind?: Kind;
  channels?: Channel[];
  to: { userId?: string; email?: string; phone?: string };
  event?: string;
  title: string;
  body: string;
  href?: string;
  vars?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface CreateMessageResult {
  accepted: true;
}

export class RelayClient {
  constructor(
    private readonly opts: { baseUrl: string; apiKey: string; fetch?: typeof fetch },
  ) {}

  readonly messages = {
    create: async (input: CreateMessageInput): Promise<CreateMessageResult> => {
      const fetchImpl = this.opts.fetch ?? globalThis.fetch;
      const res = await fetchImpl(new URL("/v1/messages", this.opts.baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Relay messages.create failed (${res.status}): ${detail}`);
      }
      return (await res.json()) as CreateMessageResult;
    },
  };
}
