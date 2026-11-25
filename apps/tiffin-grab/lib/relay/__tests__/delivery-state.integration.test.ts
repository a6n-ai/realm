// @vitest-db
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { makePublicId } from "@foundry/database";
import { db } from "@/db/client";
import { messageSuppression, relayOutbox } from "@/db/schema";
import { setRelayClientForTests, type RelayClient } from "@/lib/relay/client";
import { deliveryState, sentKeysWithPrefix, suppressedEmails } from "@/lib/relay/delivery-state";

const MARK = "ds-int";
const keys = [`${MARK}:a_b:1:email`, `${MARK}:axb:1:email`, `${MARK}:local:1:email`];
const supAddr = [`${MARK}-bounced@example.test`, `${MARK}-stream@example.test`];

function fakeClient(over: Partial<RelayClient> = {}): RelayClient {
  return {
    send: vi.fn(),
    templateOverrides: vi.fn(),
    messagesByKeys: vi.fn(async () => []),
    suppressionStatus: vi.fn(async () => []),
    suppress: vi.fn(),
    createCampaign: vi.fn(),
    getMessage: vi.fn(),
    ...over,
  } as unknown as RelayClient;
}

beforeAll(async () => {
  await db.insert(relayOutbox).values([
    { publicId: makePublicId("rob")(), idempotencyKey: keys[0]!, recipientEmail: "x@example.test", stream: "transactional", payload: {}, status: "sent", nextAttemptAt: 0 },
    { publicId: makePublicId("rob")(), idempotencyKey: keys[1]!, recipientEmail: "x@example.test", stream: "transactional", payload: {}, status: "pending", nextAttemptAt: 0 },
    {
      publicId: makePublicId("rob")(),
      idempotencyKey: keys[2]!,
      recipientEmail: "y@example.test",
      stream: "transactional",
      payload: {},
      status: "sent",
      nextAttemptAt: 0,
      relayMessageId: "m-local",
    },
  ]);
  await db.insert(messageSuppression).values([
    { address: supAddr[0]!, channel: "email", scope: "all", reason: "bounce" },
  ] as never);
});

afterAll(async () => {
  await db.delete(relayOutbox).where(inArray(relayOutbox.idempotencyKey, keys));
  await db.delete(messageSuppression).where(inArray(messageSuppression.address, [supAddr[0]!]));
});

afterEach(() => setRelayClientForTests(null));

describe("sentKeysWithPrefix", () => {
  it("matches the prefix literally: _ is not a wildcard and the :email suffix is dropped", async () => {
    const found = await sentKeysWithPrefix(`${MARK}:a_b:`);
    expect([...found]).toEqual([`${MARK}:a_b:1`]);
  });

  it("finds nothing for a prefix with no rows", async () => {
    expect((await sentKeysWithPrefix(`${MARK}:none:`)).size).toBe(0);
  });
});

describe("deliveryState", () => {
  it("returns the local status when the row has no Relay message id", async () => {
    const send = fakeClient();
    setRelayClientForTests(send);
    const state = await deliveryState([keys[0]!]);
    expect(state.get(keys[0]!)).toMatchObject({ status: "sent", deliveredAt: null });
    expect(send.messagesByKeys).not.toHaveBeenCalled();
  });

  it("overlays Relay's view for rows Relay has", async () => {
    const client = fakeClient({
      messagesByKeys: vi.fn(async (ks: string[]) => ks.map((key) => ({ key, messageId: "m", status: "failed" as const, sentAt: 1, deliveredAt: null, bouncedAt: 2, complainedAt: null, opens: 0, clicks: 0, error: "bad" }))),
    });
    setRelayClientForTests(client);
    const state = await deliveryState([keys[2]!]);
    expect(state.get(keys[2]!)).toMatchObject({ status: "failed", bouncedAt: 2, error: "bad" });
    expect(client.messagesByKeys).toHaveBeenCalledWith([keys[2]]);
  });

  it("keeps the local status when Relay throws", async () => {
    setRelayClientForTests(fakeClient({ messagesByKeys: vi.fn(async () => { throw new Error("down"); }) }));
    const state = await deliveryState([keys[2]!]);
    expect(state.get(keys[2]!)).toMatchObject({ status: "sent" });
  });
});

describe("suppressedEmails", () => {
  it("unions the engine table with Relay's all-stream suppressions only", async () => {
    setRelayClientForTests(
      fakeClient({
        suppressionStatus: vi.fn(async () => [
          { email: supAddr[1]!, stream: null, reason: "manual" as const, brandOptOut: false },
          { email: `${MARK}-marketing@example.test`, stream: "marketing", reason: "unsubscribe" as const, brandOptOut: false },
        ]),
      }),
    );
    const out = await suppressedEmails([supAddr[0]!, supAddr[1]!, `${MARK}-marketing@example.test`]);
    expect([...out].sort()).toEqual([supAddr[0], supAddr[1]].sort());
  });

  it("keeps the engine table when Relay throws", async () => {
    setRelayClientForTests(fakeClient({ suppressionStatus: vi.fn(async () => { throw new Error("down"); }) }));
    expect([...(await suppressedEmails([supAddr[0]!]))]).toEqual([supAddr[0]]);
  });
});
