// @vitest-db
import { afterEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { setRelayClientForTests, type RelayClient } from "@/lib/relay/client";
import { countPendingInvites } from "@/lib/services/customers.service";

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
});
