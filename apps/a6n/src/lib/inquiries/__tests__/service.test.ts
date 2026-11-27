import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { getDb } from "../../../db/client";
import { createInquiriesService, type IngestInput } from "../service";
import { createSourcesService } from "../sources";
import { searchCompanies, toNameKey } from "../companies";

const NOW = Date.now();
const me = { userId: "usr_me" };
const other = { userId: "usr_other" };
const svc = () => createInquiriesService(getDb(env));
const all = <T>(q: string, ...args: unknown[]) => env.DB.prepare(q).bind(...args).all<T>().then((r) => r.results);
const activities = (id: string, type?: string) =>
  all<{ type: string; from_stage: string | null; to_stage: string | null; from_owner_id: string | null; to_owner_id: string | null }>(
    `select * from inquiry_activities where inquiry_id = ?${type ? " and type = ?" : ""}`,
    ...(type ? [id, type] : [id]),
  );

let seq = 0;
const input = (over: Partial<IngestInput> = {}): IngestInput => ({
  source: "cold",
  contact: { name: `Contact ${++seq}`, phone: "555-0100" },
  nextFollowUpAt: NOW + 86_400_000,
  createdVia: "manual",
  ...over,
});
const ingest = async (over: Partial<IngestInput> = {}) => {
  const r = await svc().ingest(input(over), me);
  if (!r.ok) throw new Error(`ingest refused: ${r.code}`);
  return r.inquiry;
};

beforeAll(applyMigrations);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("delete from inquiry_activities"),
    env.DB.prepare("delete from inquiries"),
    env.DB.prepare("delete from companies"),
    env.DB.prepare("delete from audit_log"),
    env.DB.prepare("delete from lead_subsources"),
    env.DB.prepare("delete from lead_sources"),
    env.DB.prepare("delete from users"),
    ...["usr_me", "usr_other", "usr_gone"].map((id) =>
      env.DB.prepare(
        "insert into users (id, name, email, role, status, created_at, updated_at) values (?, ?, ?, 'sales', ?, ?, ?)",
      ).bind(id, id, `${id}@x.io`, id === "usr_gone" ? "removed" : "active", NOW, NOW),
    ),
    env.DB.prepare("insert into lead_sources (id, created_at, key, label, active) values ('lsr_cold', ?, 'cold', 'Cold', 1)").bind(NOW),
    env.DB.prepare("insert into lead_sources (id, created_at, key, label, active) values ('lsr_off', ?, 'off', 'Off', 0)").bind(NOW),
    env.DB.prepare("insert into lead_subsources (id, created_at, source_id, key, label, active) values ('lss_a', ?, 'lsr_cold', 'linkedin', 'LinkedIn', 1)").bind(NOW),
    env.DB.prepare("insert into lead_subsources (id, created_at, source_id, key, label, active) values ('lss_b', ?, 'lsr_cold', 'old', 'Old', 0)").bind(NOW),
  ]);
});

describe("ingest", () => {
  test("creates the inquiry and a created activity", async () => {
    const inq = await ingest({ subSource: "linkedin", company: "  Acme   Corp ", ownerId: "usr_me" });
    expect(inq).toMatchObject({ stage: "new", ownerId: "usr_me", sourceId: "lsr_cold", subSourceId: "lss_a", createdBy: "usr_me" });
    const acts = await activities(inq.id);
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ type: "created", to_stage: "new", to_owner_id: "usr_me" });
    expect(await all("select * from companies")).toMatchObject([{ name: "Acme Corp", name_key: "acme corp" }]);
  });

  test("a repeat externalId returns the existing row and writes no second activity", async () => {
    const a = await ingest({ externalId: "x1" });
    const r = await svc().ingest(input({ externalId: "x1" }), other);
    expect(r).toMatchObject({ ok: true, created: false });
    expect(r.ok && r.inquiry.id).toBe(a.id);
    expect(await activities(a.id)).toHaveLength(1);
    expect(await all("select * from inquiries")).toHaveLength(1);
  });

  test("two concurrent ingests with the same externalId give one inquiry", async () => {
    const [a, b] = await Promise.all([
      createInquiriesService(getDb(env)).ingest(input({ externalId: "race" }), me),
      createInquiriesService(getDb(env)).ingest(input({ externalId: "race" }), me),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(await all("select * from inquiries")).toHaveLength(1);
    expect(await all("select * from inquiry_activities")).toHaveLength(1);
    expect([a, b].filter((r) => r.ok && r.created)).toHaveLength(1);
  });

  test("two concurrent calls with a new company name give one company", async () => {
    const [a, b] = await Promise.all([
      createInquiriesService(getDb(env)).ingest(input({ company: "Globex" }), me),
      createInquiriesService(getDb(env)).ingest(input({ company: "GLOBEX " }), me),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(await all("select * from companies")).toHaveLength(1);
    const rows = await all<{ company_id: string }>("select company_id from inquiries");
    expect(new Set(rows.map((r) => r.company_id)).size).toBe(1);
  });

  test("inactive or unknown source and sub-source return inactive_source and write nothing", async () => {
    for (const over of [{ source: "off" }, { source: "nope" }, { subSource: "old" }, { subSource: "nope" }]) {
      expect(await svc().ingest(input(over), me)).toEqual({ ok: false, code: "inactive_source" });
    }
    expect(await all("select * from inquiries")).toHaveLength(0);
    expect(await all("select * from inquiry_activities")).toHaveLength(0);
  });

  test("without externalId a second ingest of the same contact creates a second inquiry", async () => {
    const c = { name: "Same", phone: "555-1" };
    const a = await ingest({ contact: c });
    const b = await ingest({ contact: c });
    expect(a.id).not.toBe(b.id);
    expect(await all("select * from inquiries")).toHaveLength(2);
  });

  test("one phone number can have two inquiries", async () => {
    await ingest({ contact: { phone: "555-9", name: "A" } });
    await ingest({ contact: { phone: "555-9", name: "A" } });
    expect(await all("select * from inquiries where phone = '555-9'")).toHaveLength(2);
  });

  test("a contact with no name and no phone is invalid", async () => {
    expect(await svc().ingest(input({ contact: { email: "a@b.c" } }), me)).toEqual({ ok: false, code: "invalid" });
  });

  test("an inactive owner falls back to unassigned", async () => {
    expect((await ingest({ ownerId: "usr_gone" })).ownerId).toBeNull();
  });
});

describe("stage change", () => {
  test("writes one stage_change activity", async () => {
    const inq = await ingest();
    expect(await svc().changeStage(inq.id, "new", "contacted", {}, me)).toEqual({ ok: true });
    const acts = await activities(inq.id, "stage_change");
    expect(acts).toMatchObject([{ from_stage: "new", to_stage: "contacted" }]);
  });

  test("a stale from returns stale and writes no activity", async () => {
    const inq = await ingest();
    await svc().changeStage(inq.id, "new", "contacted", {}, me);
    expect(await svc().changeStage(inq.id, "new", "proposal_sent", {}, other)).toEqual({ ok: false, code: "stale" });
    expect(await activities(inq.id, "stage_change")).toHaveLength(1);
  });

  test("closing sets closedAt and clears the follow-up; lost needs a reason", async () => {
    const inq = await ingest();
    expect(await svc().changeStage(inq.id, "new", "lost", {}, me)).toEqual({ ok: false, code: "invalid" });
    expect(await svc().changeStage(inq.id, "new", "lost", { lostReason: "budget" }, me)).toEqual({ ok: true });
    const [row] = await all<{ closed_at: number | null; next_follow_up_at: number | null; lost_reason: string }>(
      "select * from inquiries where id = ?", inq.id,
    );
    expect(row.closed_at).not.toBeNull();
    expect(row.next_follow_up_at).toBeNull();
    expect(row.lost_reason).toBe("budget");
  });

  test("two concurrent stage changes give one winner and one activity", async () => {
    const inq = await ingest();
    const [a, b] = await Promise.all([
      createInquiriesService(getDb(env)).changeStage(inq.id, "new", "contacted", {}, me),
      createInquiriesService(getDb(env)).changeStage(inq.id, "new", "negotiating", {}, other),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(await activities(inq.id, "stage_change")).toHaveLength(1);
  });
});

describe("reopen", () => {
  const close = async (to: "won" | "lost", ownerId?: string) => {
    const inq = await ingest(ownerId ? { ownerId } : {});
    await svc().changeStage(inq.id, "new", to, { lostReason: "timing" }, me);
    return inq;
  };

  test("clears closedAt, sets stage and follow-up, logs reopened with from and to", async () => {
    const inq = await close("lost", "usr_me");
    expect(await svc().reopen(inq.id, "contacted", NOW + 5, me)).toEqual({ ok: true });
    const [row] = await all<Record<string, unknown>>("select * from inquiries where id = ?", inq.id);
    expect(row).toMatchObject({ stage: "contacted", closed_at: null, next_follow_up_at: NOW + 5, lost_reason: null, owner_id: "usr_me" });
    expect(await activities(inq.id, "reopened")).toMatchObject([{ from_stage: "lost", to_stage: "contacted" }]);
  });

  test("an invalid stage or missing date is invalid", async () => {
    const inq = await close("won");
    expect(await svc().reopen(inq.id, "won", NOW, me)).toEqual({ ok: false, code: "invalid" });
    expect(await svc().reopen(inq.id, "new", undefined as never, me)).toEqual({ ok: false, code: "invalid" });
  });

  test("an inquiry whose owner was removed lands in Unassigned", async () => {
    const inq = await close("won", "usr_me");
    await env.DB.prepare("update users set status = 'removed' where id = 'usr_me'").run();
    expect(await svc().reopen(inq.id, "new", NOW, other)).toEqual({ ok: true });
    const counts = await svc().unassignedCounts();
    expect(counts.total).toBe(1);
    const view = await svc().listForView({ view: "unassigned", userId: "usr_other" });
    expect(view.rows.map((r) => r.id)).toEqual([inq.id]);
  });

  test("reopening an open inquiry is stale", async () => {
    const inq = await ingest();
    expect(await svc().reopen(inq.id, "new", NOW, me)).toEqual({ ok: false, code: "stale" });
  });

  test("two concurrent reopens give one reopened activity", async () => {
    const inq = await close("won");
    const [a, b] = await Promise.all([
      createInquiriesService(getDb(env)).reopen(inq.id, "new", NOW, me),
      createInquiriesService(getDb(env)).reopen(inq.id, "contacted", NOW, other),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(await activities(inq.id, "reopened")).toHaveLength(1);
  });
});

describe("claim", () => {
  test("two concurrent claims give one owner and one reassigned activity", async () => {
    const inq = await ingest();
    const [a, b] = await Promise.all([
      createInquiriesService(getDb(env)).claim(inq.id, me),
      createInquiriesService(getDb(env)).claim(inq.id, other),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((r) => !r.ok)).toEqual({ ok: false, code: "already_claimed" });
    const acts = await activities(inq.id, "reassigned");
    expect(acts).toHaveLength(1);
    const [row] = await all<{ owner_id: string }>("select owner_id from inquiries where id = ?", inq.id);
    expect(row.owner_id).toBe(acts[0].to_owner_id);
  });

  test("claiming a closed or missing inquiry is refused", async () => {
    const inq = await ingest();
    await svc().changeStage(inq.id, "new", "won", {}, me);
    expect((await svc().claim(inq.id, me)).ok).toBe(false);
    expect(await svc().claim("inq_missing", me)).toEqual({ ok: false, code: "stale" });
  });
});

describe("assign", () => {
  test("assigning to a removed user returns stale", async () => {
    const inq = await ingest();
    expect(await svc().assign(inq.id, null, "usr_gone", me)).toEqual({ ok: false, code: "stale" });
    expect(await activities(inq.id, "reassigned")).toHaveLength(0);
  });

  test("a wrong from owner returns stale", async () => {
    const inq = await ingest({ ownerId: "usr_me" });
    expect(await svc().assign(inq.id, "usr_other", "usr_other", me)).toEqual({ ok: false, code: "invalid" });
    expect(await svc().assign(inq.id, null, "usr_other", me)).toEqual({ ok: false, code: "stale" });
  });

  test("two concurrent assigns give one reassigned activity", async () => {
    const inq = await ingest();
    const [a, b] = await Promise.all([
      createInquiriesService(getDb(env)).assign(inq.id, null, "usr_me", me),
      createInquiriesService(getDb(env)).assign(inq.id, null, "usr_other", me),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(await activities(inq.id, "reassigned")).toHaveLength(1);
  });
});

describe("activities, follow-up, contact", () => {
  test("addActivity accepts note types only and needs a note", async () => {
    const inq = await ingest();
    expect(await svc().addActivity(inq.id, { type: "call", note: "rang" }, me)).toEqual({ ok: true });
    expect(await svc().addActivity(inq.id, { type: "stage_change", note: "x" }, me)).toEqual({ ok: false, code: "invalid" });
    expect(await svc().addActivity(inq.id, { type: "note", note: "  " }, me)).toEqual({ ok: false, code: "invalid" });
    expect(await svc().addActivity("inq_missing", { type: "note", note: "x" }, me)).toEqual({ ok: false, code: "stale" });
    expect(await activities(inq.id, "call")).toHaveLength(1);
  });

  test("setFollowUp updates an open inquiry and refuses a closed one", async () => {
    const inq = await ingest();
    expect(await svc().setFollowUp(inq.id, NOW + 9, me)).toEqual({ ok: true });
    expect((await all<{ next_follow_up_at: number }>("select next_follow_up_at from inquiries where id = ?", inq.id))[0].next_follow_up_at).toBe(NOW + 9);
    await svc().changeStage(inq.id, "new", "won", {}, me);
    expect(await svc().setFollowUp(inq.id, NOW, me)).toEqual({ ok: false, code: "stale" });
  });

  test("updateContact patches fields and keeps name-or-phone", async () => {
    const inq = await ingest({ contact: { name: "Ann", phone: null } });
    expect(await svc().updateContact(inq.id, { email: "a@b.c", requirements: "site" }, me)).toEqual({ ok: true });
    expect(await svc().updateContact(inq.id, { contactName: null }, me)).toEqual({ ok: false, code: "invalid" });
    expect(await svc().updateContact(inq.id, { contactName: null, phone: "5" }, me)).toEqual({ ok: true });
    expect(await svc().updateContact("inq_missing", { phone: "5" }, me)).toEqual({ ok: false, code: "stale" });
  });
});

describe("listForView", () => {
  test("in mine and unassigned, overdue inquiries come first; all is newest first", async () => {
    const late = await ingest({ ownerId: "usr_me", nextFollowUpAt: NOW - 1000 });
    const soon = await ingest({ ownerId: "usr_me", nextFollowUpAt: NOW + 1000 });
    const earlier = await ingest({ ownerId: "usr_me", nextFollowUpAt: NOW - 5000 });
    const mine = await svc().listForView({ view: "mine", userId: "usr_me", now: NOW });
    expect(mine.rows.map((r) => r.id)).toEqual([earlier.id, late.id, soon.id]);
    expect(mine.rows.map((r) => r.overdue)).toEqual([true, true, false]);
    expect(mine.hasNext).toBe(false);

    const u1 = await ingest({ nextFollowUpAt: NOW + 50 });
    const u2 = await ingest({ nextFollowUpAt: NOW - 50 });
    const un = await svc().listForView({ view: "unassigned", userId: "usr_me", now: NOW });
    expect(un.rows.map((r) => r.id)).toEqual([u2.id, u1.id]);
    expect(await svc().unassignedCounts(NOW)).toEqual({ total: 2, overdue: 1 });

    await svc().changeStage(soon.id, "new", "won", {}, me);
    const everything = await svc().listForView({ view: "all", userId: "usr_me" });
    expect(everything.rows).toHaveLength(5);
    expect(everything.rows.find((r) => r.id === soon.id)?.stage).toBe("won");
    expect((await svc().listForView({ view: "all", userId: "usr_me", filters: { stage: "won" } })).rows).toHaveLength(1);
  });

  test("the due filter keeps open inquiries with a follow-up at or before now", async () => {
    const past = await ingest({ nextFollowUpAt: NOW - 1000 });
    await ingest({ nextFollowUpAt: NOW + 1000 });
    const closed = await ingest({ nextFollowUpAt: NOW - 2000 });
    await svc().changeStage(closed.id, "new", "won", {}, me);
    const due = await svc().listForView({ view: "all", userId: "usr_me", filters: { overdue: true }, now: NOW });
    expect(due.rows.map((r) => r.id)).toEqual([past.id]);
    expect((await svc().listForView({ view: "all", userId: "usr_me", now: NOW })).rows).toHaveLength(3);
  });

  test("search, owner removed flag, company name and paging", async () => {
    const a = await ingest({ ownerId: "usr_me", company: "Initech", contact: { name: "Bill_Lumbergh", phone: "1" } });
    await env.DB.prepare("update users set status = 'removed' where id = 'usr_me'").run();
    const hit = await svc().listForView({ view: "all", userId: "x", search: "initech" });
    expect(hit.rows).toMatchObject([{ id: a.id, companyName: "Initech", ownerName: "usr_me", ownerRemoved: true }]);
    expect((await svc().listForView({ view: "all", userId: "x", search: "bill_l" })).rows).toHaveLength(1);
    expect((await svc().listForView({ view: "all", userId: "x", search: "bill%" })).rows).toHaveLength(0);

    for (let i = 0; i < 50; i++) await ingest();
    const p0 = await svc().listForView({ view: "all", userId: "x" });
    expect(p0.rows).toHaveLength(50);
    expect(p0.hasNext).toBe(true);
    const p1 = await svc().listForView({ view: "all", userId: "x", page: 1 });
    expect(p1.rows).toHaveLength(1);
    expect(p1.hasNext).toBe(false);
  });
});

describe("companies and sources", () => {
  test("toNameKey lowercases, trims and collapses spaces; searchCompanies returns matches", async () => {
    expect(toNameKey("  Acme   CORP ")).toBe("acme corp");
    await ingest({ company: "Acme Corp" });
    expect(await searchCompanies(getDb(env), "acm")).toMatchObject([{ name: "Acme Corp" }]);
    expect(await searchCompanies(getDb(env), "zzz")).toEqual([]);
  });

  test("sources are created, renamed, deactivated and audited; never deleted", async () => {
    const s = createSourcesService(getDb(env));
    const created = await s.create({ key: "partner", label: "Partner" }, me);
    expect(created.ok).toBe(true);
    expect(await s.create({ key: "partner", label: "Dup" }, me)).toEqual({ ok: false, code: "invalid" });
    const id = created.ok ? created.id! : "";
    expect(await s.rename(id, "Partners", me)).toEqual({ ok: true });
    expect(await s.setActive(id, false, me)).toEqual({ ok: true });
    expect(await s.setActive(id, false, me)).toEqual({ ok: false, code: "stale" });
    expect((await s.listActive()).sources.map((r) => r.key)).toEqual(["cold"]);
    expect((await s.listAll()).sources.map((r) => r.key).sort()).toEqual(["cold", "off", "partner"]);
    const sub = await s.addSubsource("lsr_cold", { key: "events", label: "Events" }, me);
    expect(sub.ok).toBe(true);
    expect(await s.setSubsourceActive(sub.ok ? sub.id! : "", false, me)).toEqual({ ok: true });
    expect((await all("select * from audit_log")).length).toBe(5);
  });
});

describe("sub-source rename", () => {
  test("renames, audits, and reports stale when nothing changes", async () => {
    const s = createSourcesService(getDb(env));
    expect(await s.renameSubsource("lss_a", "LinkedIn Ads", me)).toEqual({ ok: true });
    expect(await s.renameSubsource("lss_a", "LinkedIn Ads", me)).toEqual({ ok: false, code: "stale" });
    expect(await s.renameSubsource("lss_a", "  ", me)).toEqual({ ok: false, code: "invalid" });
    expect((await s.listAll()).subsources.find((x) => x.id === "lss_a")?.label).toBe("LinkedIn Ads");
    expect((await all("select * from audit_log where action = 'subsource.rename'")).length).toBe(1);
  });
});
