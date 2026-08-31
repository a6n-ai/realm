import { describe, expect, it, vi } from "vitest";
import { RelayClient } from "./index";

describe("RelayClient", () => {
  it("POSTs /v1/messages with the API key", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ accepted: true }), { status: 202 }));
    const client = new RelayClient({
      baseUrl: "https://relay.example",
      apiKey: "pk_test_abc",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await client.messages.create({
      title: "Hello",
      body: "World",
      to: { email: "a@b.com" },
      event: "order.confirmed",
      idempotencyKey: "order.confirmed:1",
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://relay.example/v1/messages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer pk_test_abc");
  });
});
