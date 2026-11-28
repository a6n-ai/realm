import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { memberStmt, orgStmt, TEST_ORG } from "../../../../test/helpers";
import { getDb } from "../../../db/client";
import { listBoardColumns } from "../queries";
import { BOARD_CARDS } from "../repository";

const NOW = Date.now();
const DAY = 86_400_000;
const actor = { userId: "usr_me", organizationId: TEST_ORG };
const board = (input: Partial<Parameters<typeof listBoardColumns>[2]> = {}) => listBoardColumns(getDb(env), actor, { view: "all", ...input });
const col = (cols: Awaited<ReturnType<typeof board>>, stage: string) => cols.find((c) => c.stage === stage)!;

let seq = 0;
const insert = (o: { stage?: string; org?: string; owner?: string | null; name?: string; closedAt?: number | null; follow?: number | null; source?: string }) => {
  const closed = o.closedAt ?? null;
  return env.DB.prepare(
    `insert into inquiries (id, created_at, organization_id, contact_name, source_id, stage, owner_id, next_follow_up_at, closed_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(`inq_${++seq}`, NOW, o.org ?? TEST_ORG, o.name ?? `Contact ${seq}`, o.source ?? "lsr_cold", o.stage ?? "new", o.owner ?? null, closed === null ? (o.follow ?? NOW + DAY) : null, closed);
};

beforeAll(applyMigrations);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("delete from inquiry_activities"),
    env.DB.prepare("delete from inquiries"),
    env.DB.prepare("delete from companies"),
    env.DB.prepare("delete from lead_sources"),
    env.DB.prepare("delete from users"),
    env.DB.prepare("insert or ignore into organizations (id, name, slug, created_at) values ('org_b', 'B', 'b', ?)").bind(NOW),
    ...["usr_me", "usr_other"].map((id) =>
      env.DB.prepare("insert into users (id, name, email, role, status, created_at, updated_at) values (?, ?, ?, 'sales', 'active', ?, ?)").bind(id, id, `${id}@x.io`, NOW, NOW),
    ),
    orgStmt(),
    memberStmt("usr_me"),
    env.DB.prepare("insert into lead_sources (id, organization_id, created_at, key, label, active) values ('lsr_cold', 'org_test', ?, 'cold', 'Cold', 1)").bind(NOW),
    env.DB.prepare("insert into lead_sources (id, organization_id, created_at, key, label, active) values ('lsr_b', 'org_b', ?, 'cold', 'Cold', 1)").bind(NOW),
    env.DB.prepare("insert into lead_sources (id, organization_id, created_at, key, label, active) values ('lsr_web', 'org_test', ?, 'web', 'Web', 1)").bind(NOW),
  ]);
});

describe("listBoardColumns", () => {
  test("returns every stage in order with counts and cards", async () => {
    await env.DB.batch([insert({ stage: "new" }), insert({ stage: "new" }), insert({ stage: "negotiating" })]);
    const cols = await board();
    expect(cols.map((c) => c.stage)).toEqual(["new", "contacted", "requirements_gathered", "proposal_sent", "negotiating", "won", "lost"]);
    expect(col(cols, "new").count).toBe(2);
    expect(col(cols, "new").cards).toHaveLength(2);
    expect(col(cols, "contacted")).toMatchObject({ count: 0, cards: [] });
  });

  test("caps cards at 50 per stage but counts them all", async () => {
    await env.DB.batch(Array.from({ length: BOARD_CARDS + 7 }, () => insert({ stage: "contacted" })));
    const contacted = col(await board(), "contacted");
    expect(contacted.count).toBe(BOARD_CARDS + 7);
    expect(contacted.cards).toHaveLength(BOARD_CARDS);
  });

  test("never shows another organisation's cards or counts", async () => {
    await env.DB.batch([insert({ stage: "new" }), insert({ stage: "new", org: "org_b", source: "lsr_b", name: "Secret" })]);
    const cols = await board();
    expect(col(cols, "new").count).toBe(1);
    expect(cols.flatMap((c) => c.cards).map((c) => c.contactName)).not.toContain("Secret");
  });

  test("closed columns keep only the last 30 days", async () => {
    await env.DB.batch([
      insert({ stage: "won", closedAt: NOW - 29 * DAY }),
      insert({ stage: "won", closedAt: NOW - 31 * DAY }),
      insert({ stage: "lost", closedAt: NOW - DAY }),
    ]);
    const cols = await board();
    expect(col(cols, "won").count).toBe(1);
    expect(col(cols, "lost").count).toBe(1);
  });

  test("owner, source and search filters apply, and the stage filter is ignored", async () => {
    await env.DB.batch([
      insert({ stage: "new", owner: "usr_me", name: "Alice Mine" }),
      insert({ stage: "contacted", owner: "usr_other", name: "Bob Other", source: "lsr_web" }),
    ]);
    expect((await board({ owner: "usr_me" })).flatMap((c) => c.cards).map((c) => c.contactName)).toEqual(["Alice Mine"]);
    expect((await board({ source: "lsr_web" })).flatMap((c) => c.cards).map((c) => c.contactName)).toEqual(["Bob Other"]);
    expect((await board({ q: "alice" })).flatMap((c) => c.cards)).toHaveLength(1);
  });

  test("the unassigned and mine tabs scope the board and hide closed inquiries", async () => {
    await env.DB.batch([
      insert({ stage: "new", owner: null, name: "Free" }),
      insert({ stage: "new", owner: "usr_me", name: "Mine" }),
      insert({ stage: "won", owner: "usr_me", closedAt: NOW - DAY }),
    ]);
    expect((await board({ view: "unassigned" })).flatMap((c) => c.cards).map((c) => c.contactName)).toEqual(["Free"]);
    const mine = await board({ view: "mine" });
    expect(mine.flatMap((c) => c.cards).map((c) => c.contactName)).toEqual(["Mine"]);
    expect(col(mine, "won").count).toBe(0);
  });

  test("a card carries its overdue flag, source and owner", async () => {
    await env.DB.batch([insert({ stage: "new", owner: "usr_me", follow: NOW - DAY })]);
    const [card] = col(await board(), "new").cards;
    expect(card).toMatchObject({ overdue: true, source: "Cold", ownerName: "usr_me", ownerRemoved: false });
  });
});
