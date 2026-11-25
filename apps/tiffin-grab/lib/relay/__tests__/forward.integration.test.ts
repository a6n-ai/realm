import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { relayOutbox, users } from "@/db/schema";
import { forwardRelayOutbox } from "@/lib/relay/forward";
import { setRelayClientForTests, type RelayClient, type RelayTemplateOverride } from "@/lib/relay/client";
import { clearTemplateOverrideCache } from "@/lib/relay/overrides";

const MARK = "fwd-int";
const created: bigint[] = [];
let send: Mock<(input: unknown) => Promise<unknown>>;
let overrides: RelayTemplateOverride[];

async function makeUser(): Promise<bigint> {
  const [u] = await db.insert(users).values({ name: MARK, email: `${MARK}-${created.length}@example.test`, role: "user", status: "active" }).returning({ id: users.id });
  created.push(u!.id);
  return u!.id;
}

async function addRow(key: string, extra: Partial<typeof relayOutbox.$inferInsert> = {}) {
  const recipientId = created[0]!;
  const [row] = await db
    .insert(relayOutbox)
    .values({
      idempotencyKey: key,
      event: "payment_received",
      recipientId,
      recipientEmail: `${MARK}-r@example.test`,
      stream: "transactional",
      payload: { event: "payment_received", locale: "en", vars: { payment: { customerName: "Ann" } }, title: "t", body: "b", href: null },
      status: "pending",
      nextAttemptAt: Date.now(),
      updatedAt: Date.now(),
      ...extra,
    })
    .returning();
  return row!;
}

const rowOf = async (id: bigint) => (await db.select().from(relayOutbox).where(eq(relayOutbox.id, id)))[0]!;

beforeEach(async () => {
  send = vi.fn(async (_input: unknown) => ({ messageId: "m-1", status: "queued", duplicate: false }));
  overrides = [];
  clearTemplateOverrideCache();
  setRelayClientForTests({
    send: (input: unknown) => send(input),
    templateOverrides: async () => overrides,
  } as unknown as RelayClient);
  await db.delete(relayOutbox);
  await makeUser();
});

afterEach(async () => {
  setRelayClientForTests(null);
  await db.delete(relayOutbox);
  await db.delete(users).where(inArray(users.id, created));
  created.length = 0;
});

describe("forwardRelayOutbox", () => {
  it("sends once with the idempotency key and marks the row sent", async () => {
    const row = await addRow(`${MARK}-1:email`);
    const out = await forwardRelayOutbox();
    expect(out.sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ stream: "transactional", to: `${MARK}-r@example.test`, idempotencyKey: `${MARK}-1:email`, event: "payment_received" });
    expect(await rowOf(row.id)).toMatchObject({ status: "sent", relayMessageId: "m-1", lastError: null });
  });

  it("on an RPC error keeps the row pending with attempts 1 and a 60 s backoff", async () => {
    send.mockRejectedValueOnce(new Error("relay down"));
    const row = await addRow(`${MARK}-2:email`);
    const before = Date.now();
    await forwardRelayOutbox();
    const after = await rowOf(row.id);
    expect(after).toMatchObject({ status: "pending", attempts: 1, lastError: "relay down" });
    expect(Number(after.nextAttemptAt) - before).toBeGreaterThanOrEqual(60_000 - 1000);
    expect(Number(after.nextAttemptAt) - before).toBeLessThanOrEqual(60_000 + 5000);
  });

  it("marks the row failed on the sixth failed attempt", async () => {
    send.mockRejectedValueOnce(new Error("relay down"));
    const row = await addRow(`${MARK}-3:email`, { attempts: 5 });
    await forwardRelayOutbox();
    expect(await rowOf(row.id)).toMatchObject({ status: "failed", attempts: 6 });
  });

  it("treats a duplicate result as sent", async () => {
    send.mockResolvedValueOnce({ messageId: "m-old", status: "sent", duplicate: true });
    const row = await addRow(`${MARK}-4:email`);
    await forwardRelayOutbox();
    expect(await rowOf(row.id)).toMatchObject({ status: "sent", relayMessageId: "m-old" });
  });

  it("skips a row whose template is disabled in Relay, without calling send or retrying", async () => {
    overrides = [{ event: "payment_received", locale: "en", subject: "x", intro: null, enabled: false }];
    const row = await addRow(`${MARK}-5:email`);
    await forwardRelayOutbox();
    expect(send).not.toHaveBeenCalled();
    expect(await rowOf(row.id)).toMatchObject({ status: "skipped", lastError: "template disabled", attempts: 0 });
  });

  it("skips a row whose event has no template at all", async () => {
    const row = await addRow(`${MARK}-12:email`, { payload: { event: "order_created", locale: "en", vars: {} } });
    await forwardRelayOutbox();
    expect(send).not.toHaveBeenCalled();
    expect(await rowOf(row.id)).toMatchObject({ status: "skipped", lastError: "template missing", attempts: 0 });
  });

  it("defers the batch without an attempt when Relay's overrides are unknown, and never renders", async () => {
    setRelayClientForTests({ send: (input: unknown) => send(input), templateOverrides: async () => { throw new Error("relay down"); } } as unknown as RelayClient);
    const row = await addRow(`${MARK}-10:email`);
    await forwardRelayOutbox();
    expect(send).not.toHaveBeenCalled();
    const after = await rowOf(row.id);
    expect(after).toMatchObject({ status: "pending", attempts: 0 });
    expect(Number(after.nextAttemptAt) - Date.now()).toBeLessThanOrEqual(16_000);
  });

  it("does not overwrite a row that another forwarder re-claimed after this one's lease", async () => {
    const row = await addRow(`${MARK}-11:email`);
    send.mockImplementationOnce(async () => {
      await db.update(relayOutbox).set({ nextAttemptAt: 4_102_444_800_000 }).where(eq(relayOutbox.id, row.id));
      return { messageId: "m-late", status: "queued", duplicate: false };
    });
    await forwardRelayOutbox();
    expect(await rowOf(row.id)).toMatchObject({ status: "pending", relayMessageId: null, nextAttemptAt: 4_102_444_800_000 });
  });

  it("stores a Relay failed result as failed with its status as the error", async () => {
    send.mockResolvedValueOnce({ messageId: "m-f", status: "failed", duplicate: false });
    const row = await addRow(`${MARK}-13:email`);
    await forwardRelayOutbox();
    expect(await rowOf(row.id)).toMatchObject({ status: "failed", lastError: "failed", relayMessageId: "m-f" });
  });

  it("sends each row once when two forwarders run at the same time", async () => {
    send.mockImplementation(async (_input: unknown) => {
      await new Promise((r) => setTimeout(r, 30));
      return { messageId: "m", status: "queued", duplicate: false };
    });
    for (let i = 0; i < 3; i++) await addRow(`${MARK}-6-${i}:email`);
    await Promise.all([forwardRelayOutbox(), forwardRelayOutbox()]);
    const keys = send.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey);
    expect(keys.sort()).toEqual([`${MARK}-6-0:email`, `${MARK}-6-1:email`, `${MARK}-6-2:email`]);
  });

  it("fetches receipt attachments and sends them as base64, and leaves the sender to Relay", async () => {
    const att = [{ filename: "receipt.pdf", url: "https://files.test/r.pdf", contentType: "application/pdf" }];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    try {
      const row = await addRow(`${MARK}-7:email`, { payload: { event: "payment_received", locale: "en", vars: { payment: { customerName: "Ann" } }, attachments: att } });
      await forwardRelayOutbox();
      expect(fetchSpy).toHaveBeenCalledWith("https://files.test/r.pdf", expect.objectContaining({ signal: expect.any(AbortSignal) }));
      const sent = send.mock.calls[0]![0] as Record<string, unknown>;
      expect(sent).not.toHaveProperty("from");
      expect(sent).not.toHaveProperty("fromName");
      expect(sent).not.toHaveProperty("replyTo");
      expect(sent).toMatchObject({
        attachments: [{ filename: "receipt.pdf", contentType: "application/pdf", content: "AQID" }],
      });
      expect(await rowOf(row.id)).toMatchObject({ status: "sent" });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("keeps a row pending with attempts 1 when the attachment fetch fails, and never sends it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    try {
      const row = await addRow(`${MARK}-8:email`, {
        payload: { event: "payment_received", locale: "en", vars: { payment: { customerName: "Ann" } }, attachments: [{ filename: "r.pdf", url: "https://files.test/x", contentType: "application/pdf" }] },
      });
      await forwardRelayOutbox();
      expect(send).not.toHaveBeenCalled();
      expect(await rowOf(row.id)).toMatchObject({ status: "pending", attempts: 1, lastError: "attachment r.pdf fetch 500" });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("stores a suppressed result as suppressed, not sent", async () => {
    send.mockResolvedValueOnce({ messageId: "m-s", status: "suppressed", duplicate: false });
    const row = await addRow(`${MARK}-9:email`);
    await forwardRelayOutbox();
    expect(await rowOf(row.id)).toMatchObject({ status: "suppressed", relayMessageId: "m-s" });
  });
});
