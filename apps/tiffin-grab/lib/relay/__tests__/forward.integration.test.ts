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

  it("fails a row whose template is disabled in Relay, without calling send", async () => {
    overrides = [{ event: "payment_received", locale: "en", subject: "x", intro: null, enabled: false }];
    const row = await addRow(`${MARK}-5:email`);
    const out = await forwardRelayOutbox();
    expect(out.failed).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(await rowOf(row.id)).toMatchObject({ status: "failed", lastError: "template disabled" });
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
});
