// @vitest-db
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { customerGroups } from "@/db/schema";
import { emailGroupConsole } from "@/lib/customer-groups/customer-groups.service";
import { setRelayClientForTests, type RelayClient } from "@/lib/relay/client";

const NAME = "eg-relay-int";
let groupId: bigint;
let publicId: string;

beforeAll(async () => {
  const [g] = await db.insert(customerGroups).values({ name: NAME, filters: {} }).returning({ id: customerGroups.id, publicId: customerGroups.publicId });
  groupId = g!.id;
  publicId = g!.publicId;
});

afterAll(async () => {
  await db.delete(customerGroups).where(eq(customerGroups.id, groupId));
});

afterEach(() => {
  setRelayClientForTests(null);
  vi.unstubAllEnvs();
});

describe("emailGroup under EMAIL_VIA_RELAY", () => {
  it("creates a hook campaign for the group in Relay and returns its console URL", async () => {
    vi.stubEnv("RELAY_CONSOLE_URL", "https://relay.example.test");
    const createCampaign = vi.fn(async () => ({ id: "c1", consoleUrl: "https://relay.example.test/c1" }));
    setRelayClientForTests({ createCampaign } as unknown as RelayClient);
    expect(await emailGroupConsole(publicId)).toEqual({ consoleUrl: "https://relay.example.test/c1" });
    expect(createCampaign).toHaveBeenCalledWith({ name: `${NAME} email`, audienceKind: "hook", audienceQuery: `group:${publicId}` });
  });
});
