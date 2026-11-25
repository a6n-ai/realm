// @vitest-db
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox, users } from "@/db/schema";
import { CUSTOMER_INVITATION_EVENT } from "@/lib/notifications/invite-state";
import { setRelayClientForTests, type RelayClient } from "@/lib/relay/client";
import { countPendingInvites, listCustomersPage } from "@/lib/services/customers.service";
import { like as cLike } from "@foundry/commons/model/condition";

const MARK = "cust-relay-int";
const created: bigint[] = [];
const email = `${MARK}@example.test`;

// Relay reports every address in `blocked` as all-stream suppressed.
function relayBlocking(blocked: string[]) {
  setRelayClientForTests({
    suppressionStatus: vi.fn(async (addresses: string[]) => addresses.filter((a) => blocked.includes(a)).map((a) => ({ email: a, stream: null }))),
  } as unknown as RelayClient);
}

afterEach(async () => {
  vi.unstubAllEnvs();
  setRelayClientForTests(null);
  await db.delete(notificationOutbox).where(eq(notificationOutbox.recipientEmail, email));
  await db.delete(users).where(inArray(users.id, created));
  created.length = 0;
});

describe("countPendingInvites under EMAIL_VIA_RELAY", () => {
  it("drops an invitee Relay has suppressed for all mail", async () => {
    vi.stubEnv("EMAIL_VIA_RELAY", "1");
    relayBlocking([]);
    const before = await countPendingInvites();
    const [u] = await db
      .insert(users)
      .values({ name: MARK, email, role: "user", status: "active", emailVerified: false })
      .returning({ id: users.id });
    created.push(u!.id);
    expect(await countPendingInvites()).toBe(before + 1);
    relayBlocking([email]);
    expect(await countPendingInvites()).toBe(before);
  });

  it("shows a pre-flip engine invite when Relay has no row for the address", async () => {
    vi.stubEnv("EMAIL_VIA_RELAY", "1");
    relayBlocking([]);
    const [u] = await db
      .insert(users)
      .values({ name: MARK, email, role: "user", status: "active", emailVerified: false })
      .returning({ id: users.id });
    created.push(u!.id);
    await db.insert(notificationOutbox).values({
      channel: "email",
      payload: {},
      dedupeKey: `${MARK}:invite:email`,
      event: CUSTOMER_INVITATION_EVENT,
      recipientEmail: email,
      status: "sent",
    });
    const { items } = await listCustomersPage(cLike("name", MARK), { page: 0, size: 10 });
    expect(items.find((r) => r.name === MARK)?.lastInvite).toMatchObject({ status: "sent" });
  });
});
