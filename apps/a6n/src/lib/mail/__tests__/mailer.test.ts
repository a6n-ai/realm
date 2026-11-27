import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../../env";
import { consoleMailer } from "../console-mailer";
import { MailUnavailableError, mailerFor, relayState } from "../mailer";
import { memoryMailer } from "../memory-mailer";
import { RelayMailer, type RelayRpcLike } from "../relay-mailer";

const fakeRelay = (over: Partial<RelayRpcLike> = {}) => {
  const calls: unknown[][] = [];
  const rpc: RelayRpcLike = {
    send: async (...a) => {
      calls.push(a);
      return { messageId: "msg_1", status: "queued", duplicate: false };
    },
    messagesByKeys: async () => [],
    ...over,
  };
  return { rpc, calls };
};
const asBinding = (r: RelayRpcLike) => r as unknown as Env["RELAY"];

describe("mailerFor", () => {
  it("MAILER=relay with RELAY bound picks RelayMailer", () => {
    expect(mailerFor({ MAILER: "relay", RELAY: asBinding(fakeRelay().rpc), RELAY_API_KEY: "k" })).toBeInstanceOf(RelayMailer);
  });
  it("MAILER=relay without RELAY throws MailUnavailableError", () => {
    expect(() => mailerFor({ MAILER: "relay", RELAY: undefined as never })).toThrow(MailUnavailableError);
  });
  it("MAILER=relay with an empty RELAY_API_KEY throws MailUnavailableError", () => {
    const RELAY = asBinding(fakeRelay().rpc);
    expect(() => mailerFor({ MAILER: "relay", RELAY, RELAY_API_KEY: "" })).toThrow(MailUnavailableError);
    expect(() => mailerFor({ MAILER: "relay", RELAY })).toThrow(MailUnavailableError);
  });
  it("relayState needs both the binding and a readable key", async () => {
    const RELAY = asBinding(fakeRelay().rpc);
    expect(await relayState({ RELAY, RELAY_API_KEY: "k" })).toBe("bound");
    expect(await relayState({ RELAY, RELAY_API_KEY: "" })).toBe("missing");
    expect(await relayState({ RELAY: undefined as never, RELAY_API_KEY: "k" })).toBe("missing");
  });
  it("reads a Secrets Store binding; a missing store secret reports missing", async () => {
    const RELAY = asBinding(fakeRelay().rpc);
    const stored = { get: async () => "store-key" };
    const gone = { get: async () => Promise.reject(new Error("secret not found")) };
    expect(await relayState({ RELAY, RELAY_API_KEY: stored })).toBe("bound");
    expect(await relayState({ RELAY, RELAY_API_KEY: gone })).toBe("missing");
  });
  it("MAILER=console picks ConsoleMailer", () => {
    expect(mailerFor({ MAILER: "console", RELAY: undefined as never })).toBe(consoleMailer);
  });
  it("MAILER=memory returns the shared memoryMailer", () => {
    expect(mailerFor({ MAILER: "memory", RELAY: undefined as never })).toBe(memoryMailer);
  });
  it("missing MAILER throws MailUnavailableError", () => {
    expect(() => mailerFor({ RELAY: undefined as never })).toThrow(MailUnavailableError);
    expect(() => mailerFor({ MAILER: "ses", RELAY: undefined as never })).toThrow(MailUnavailableError);
  });
});

describe("RelayMailer", () => {
  it("reads its API key from a Secrets Store binding at send time", async () => {
    const { rpc, calls } = fakeRelay();
    await new RelayMailer(rpc, { get: async () => "store_key" }).sendSignInCode("a@b.co", "123456");
    expect(calls[0]![0]).toBe("store_key");
  });
  it("sendInvite sends the exact payload", async () => {
    const { rpc, calls } = fakeRelay();
    const r = await new RelayMailer(rpc, "key_1").sendInvite("a@b.co", "https://x/invite/t", "Sam", "invite:usr_x:1");
    expect(r).toEqual({ ok: true, messageId: "msg_1" });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe("key_1");
    expect(calls[0]![1]).toEqual({
      stream: "transactional",
      to: "a@b.co",
      subject: expect.stringContaining("Sam"),
      html: expect.stringContaining("https://x/invite/t"),
      text: expect.stringContaining("https://x/invite/t"),
      idempotencyKey: "invite:usr_x:1",
    });
  });

  it("maps all six statuses", async () => {
    const base = { messageId: "m", sentAt: null, complainedAt: null, opens: 0, clicks: 0, error: null };
    const row = (key: string, status: "queued" | "sent" | "failed" | "suppressed", deliveredAt: number | null, bouncedAt: number | null) => ({
      ...base, key, status, deliveredAt, bouncedAt,
    });
    const { rpc } = fakeRelay({
      messagesByKeys: async () => [
        row("q", "queued", null, null),
        row("s", "sent", null, null),
        row("d", "sent", 5, null),
        row("b", "sent", null, 6),
        row("f", "failed", null, null),
        row("x", "suppressed", null, null),
      ],
    });
    expect(await new RelayMailer(rpc, "k").statusByKeys(["q", "s", "d", "b", "f", "x"])).toEqual({
      q: "queued", s: "sent", d: "delivered", b: "bounced", f: "failed", x: "suppressed",
    });
  });

  it("relay failure returns ok false", async () => {
    const send = vi.fn().mockRejectedValue(new Error("relay down"));
    const r = await new RelayMailer(fakeRelay({ send }).rpc, "k").sendInvite("a@b.co", "l", "Sam", "k1");
    expect(r).toEqual({ ok: false, error: "relay down" });
  });
});
