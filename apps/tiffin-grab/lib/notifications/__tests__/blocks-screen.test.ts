import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { parseFilterState } from "@foundry/design-system";

const pushBlocks = vi.hoisted(() => vi.fn());
vi.mock("@/lib/relay/blocks", async (original) => ({ ...(await original<typeof import("@/lib/relay/blocks")>()), pushBlocks }));
vi.mock("@/lib/notifications/outbox-signal", () => ({ signalOutbox: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/staff-action", async () => {
  const { runAction } = await import("@/lib/actions/action-result");
  return { staffAction: (_opts: unknown, fn: () => Promise<void>) => runAction(fn) };
});

const { db } = await import("@/db/client");
const { messageSuppression } = await import("@/db/schema");
const { loadSuppressedAddresses, suppressionSummary, SUPPRESSED_SPEC, toBlockQuery } = await import("@/lib/notifications/logs-query");
const { clearSuppressionAction } = await import("@/app/(dashboard)/dashboard/notifications/unsubscribed/actions");
const { setRelayClientForTests } = await import("@/lib/relay/client");

import type { RelayBlock, RelayClient } from "@/lib/relay/client";

const ADDRESS = "screen-one@example.test";
const listSuppressions = vi.fn();
const removeSuppression = vi.fn();
const summary = vi.fn();

const block = (reason: RelayBlock["reason"], over: Partial<RelayBlock> = {}): RelayBlock => ({
  email: ADDRESS, reason, stream: null, source: "ses", campaignRef: null, campaignName: null, createdAt: 1000, ...over,
});

const add = async (reason: string, scope: "all" | "marketing" = "all") => {
  const [row] = await db
    .insert(messageSuppression)
    .values({ address: ADDRESS, channel: "email", reason, scope })
    .returning({ publicId: messageSuppression.publicId });
  return row!.publicId;
};
const held = async () =>
  (await db.select({ reason: messageSuppression.reason }).from(messageSuppression).where(eq(messageSuppression.address, ADDRESS)))
    .map((r) => r.reason)
    .sort();
const clearLocal = () => db.delete(messageSuppression).where(like(messageSuppression.address, "screen-%"));
const flagOn = () => vi.stubEnv("EMAIL_VIA_RELAY", "1");

beforeEach(async () => {
  vi.resetAllMocks();
  pushBlocks.mockResolvedValue({ pushed: 0, pending: false });
  removeSuppression.mockResolvedValue({ removed: true });
  setRelayClientForTests({ listSuppressions, removeSuppression, suppressionSummary: summary } as unknown as RelayClient);
  vi.stubEnv("EMAIL_VIA_RELAY", "");
  await clearLocal();
});

afterEach(async () => {
  setRelayClientForTests(null);
  vi.unstubAllEnvs();
  await clearLocal();
});

describe("toBlockQuery", () => {
  it("maps every facet, the date range, search, sort and page", () => {
    const { condition, page } = parseFilterState(SUPPRESSED_SPEC, {
      scope: "all", reason: "bounce", source: "ses", from: "1000", to: "2000", q: "jane", page: "2", size: "25",
    });
    expect(toBlockQuery(condition, page, { column: "time", dir: "desc" })).toEqual({
      streams: ["all"], reasons: ["bounce"], sources: ["ses"], from: 1000, to: 2000, search: "jane",
      sort: "time", dir: "desc", offset: 50, limit: 25,
    });
  });

  it("maps open date ranges and the scope sort", () => {
    const query = (sp: Record<string, string>) => {
      const { condition, page } = parseFilterState(SUPPRESSED_SPEC, sp);
      return toBlockQuery(condition, page, { column: "scope", dir: "asc" });
    };
    expect(query({ from: "1000" })).toMatchObject({ from: 1000, sort: "stream", dir: "asc" });
    expect(query({ from: "1000" }).to).toBeUndefined();
    expect(query({ to: "2000" })).toMatchObject({ to: 2000 });
    expect(query({ to: "2000" }).from).toBeUndefined();
  });

  it("offers no channel facet and offers the ses source", () => {
    expect(SUPPRESSED_SPEC.map((f) => ("field" in f ? f.field : ""))).not.toContain("channel");
    const source = SUPPRESSED_SPEC.find((f) => "field" in f && f.field === "source") as { options: { value: string }[] };
    expect(source.options.map((o) => o.value)).toContain("ses");
  });
});

describe("loadSuppressedAddresses on Relay", () => {
  it("maps Relay rows; only a bounce or manual block is clearable", async () => {
    flagOn();
    listSuppressions.mockResolvedValue({
      rows: [block("complaint"), block("bounce"), block("manual"), block("unsubscribe", { stream: "marketing", campaignRef: "cmp_1", campaignName: "June" })],
      total: 4,
    });
    const { rows, total } = await loadSuppressedAddresses({});
    expect(total).toBe(4);
    expect(rows.map((r) => r.clearable)).toEqual([false, true, true, false]);
    expect(rows[0]).toMatchObject({ publicId: `${ADDRESS}|complaint`, address: ADDRESS, channel: "email", scope: "all" });
    expect(rows[3]).toMatchObject({ scope: "marketing", campaignPublicId: "cmp_1", campaignName: "June" });
  });

  it("rejects when Relay does, never an empty list", async () => {
    flagOn();
    listSuppressions.mockRejectedValue(new Error("down"));
    await expect(loadSuppressedAddresses({})).rejects.toThrow("down");
  });

  it("reads the summary from Relay", async () => {
    flagOn();
    summary.mockResolvedValue("relay-summary");
    expect(await suppressionSummary()).toBe("relay-summary");
  });

  it("marks local rows with the same rule when the flag is off", async () => {
    await add("SES complaint");
    await add("SES hard bounce", "marketing");
    const { rows } = await loadSuppressedAddresses({ q: ADDRESS });
    expect(Object.fromEntries(rows.map((r) => [r.reason, r.clearable]))).toEqual({ "SES complaint": false, "SES hard bounce": true });
    expect(listSuppressions).not.toHaveBeenCalled();
  });
});

describe("clearSuppressionAction on Relay", () => {
  beforeEach(flagOn);

  it("pushes pending blocks, removes at Relay, then deletes only matching local rows", async () => {
    await add("SES hard bounce");
    await add("unsubscribe", "marketing");
    removeSuppression.mockImplementation(async () => {
      expect(pushBlocks).toHaveBeenCalled();
      expect(await held()).toHaveLength(2);
      return { removed: true };
    });
    expect(await clearSuppressionAction(`${ADDRESS}|bounce`, " Screen-One@Example.test ", "bounce")).toEqual({ ok: true });
    expect(removeSuppression).toHaveBeenCalledWith({ email: ADDRESS, reason: "bounce" });
    expect(await held()).toEqual(["unsubscribe"]);
  });

  it("clears an unrecognised local reason with the manual block it was imported as", async () => {
    await add("old import");
    await add("SES complaint", "marketing");
    await clearSuppressionAction(`${ADDRESS}|manual`, ADDRESS, "manual");
    expect(await held()).toEqual(["SES complaint"]);
  });

  it("keeps a local complaint when staff clear a bounce for the address", async () => {
    await add("SES complaint");
    await clearSuppressionAction(`${ADDRESS}|bounce`, ADDRESS, "bounce");
    expect(await held()).toEqual(["SES complaint"]);
  });

  it("changes nothing while blocks are still queued", async () => {
    await add("SES hard bounce");
    pushBlocks.mockResolvedValue({ pushed: 0, pending: true });
    expect(await clearSuppressionAction(`${ADDRESS}|bounce`, ADDRESS, "bounce")).toHaveProperty("error");
    expect(removeSuppression).not.toHaveBeenCalled();
    expect(await held()).toEqual(["SES hard bounce"]);
  });

  it("changes nothing when Relay refuses, without echoing its message", async () => {
    await add("SES hard bounce");
    removeSuppression.mockRejectedValue(new Error(`no block for ${ADDRESS}`));
    const result = await clearSuppressionAction(`${ADDRESS}|bounce`, ADDRESS, "bounce");
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain(ADDRESS);
    expect(await held()).toEqual(["SES hard bounce"]);
  });
});

describe.each(["1", ""])("clearSuppressionAction with EMAIL_VIA_RELAY=%j", (flag) => {
  it.each(["complaint", "unsubscribe"])("never removes a %s", async (reason) => {
    vi.stubEnv("EMAIL_VIA_RELAY", flag);
    const publicId = await add(reason);
    expect(await clearSuppressionAction(publicId, ADDRESS, reason)).toHaveProperty("error");
    expect(pushBlocks).not.toHaveBeenCalled();
    expect(removeSuppression).not.toHaveBeenCalled();
    expect(await held()).toEqual([reason]);
  });
});

describe("clearSuppressionAction on the local table", () => {
  it("clears a bounce", async () => {
    const publicId = await add("carrier undeliverable 30006");
    expect(await clearSuppressionAction(publicId, ADDRESS, "carrier undeliverable 30006")).toEqual({ ok: true });
    expect(await held()).toEqual([]);
    expect(removeSuppression).not.toHaveBeenCalled();
  });

  it.each(["SES complaint", "sms STOP keyword", "old import"])("judges the stored reason %j, not the one sent", async (stored) => {
    const publicId = await add(stored);
    expect(await clearSuppressionAction(publicId, ADDRESS, "bounce")).toHaveProperty("error");
    expect(await held()).toEqual([stored]);
  });
});
