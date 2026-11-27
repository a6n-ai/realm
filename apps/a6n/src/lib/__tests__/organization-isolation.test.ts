import { env } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { actorOf, addMember, freshId, insertOrg, insertUser } from "../../../test/helpers";
import { applyMigrations } from "../../../test/migrate";
import { getDb } from "../../db/client";
import { searchCompanies } from "../inquiries/companies";
import { getInquiryDetail, listInquiriesPage, listOwners } from "../inquiries/queries";
import { unassignedCounts } from "../inquiries/repository";
import { createInquiriesService } from "../inquiries/service";
import { createSourcesService } from "../inquiries/sources";

// Two organisations, each with an owner, a source and sub-source, a company and an inquiry. Nothing crosses over.
const db = () => getDb(env);
let orgA: string, orgB: string, a: ReturnType<typeof actorOf>, b: ReturnType<typeof actorOf>;
let inqA: string, srcA: string, subA: string;

async function seedOrg(org: string, tag: string, ownerId: string) {
  const actor = actorOf(ownerId, tag, "owner", org);
  const sources = createSourcesService(db(), org);
  const src = await sources.create({ key: `src_${tag}`, label: `Source ${tag}` }, actor);
  if (!src.ok || !src.id) throw new Error("source");
  const sub = await sources.addSubsource(src.id, { key: `sub_${tag}`, label: `Sub ${tag}` }, actor);
  if (!sub.ok || !sub.id) throw new Error("subsource");
  const res = await createInquiriesService(db(), org).ingest(
    { source: `src_${tag}`, subSource: `sub_${tag}`, contact: { name: `Contact ${tag}` }, company: `Company ${tag}`,
      nextFollowUpAt: Date.now() - 1000, createdVia: "manual" },
    actor,
  );
  if (!res.ok) throw new Error(`ingest ${res.code}`);
  return { actor, inquiry: res.inquiry.id, source: src.id, subsource: sub.id };
}

beforeAll(async () => {
  await applyMigrations();
  orgA = await insertOrg();
  orgB = await insertOrg();
  const ua = await insertUser(`a-${freshId()}@a6n.test`, "owner");
  const ub = await insertUser(`b-${freshId()}@a6n.test`, "owner");
  await addMember(ua, orgA, "owner");
  await addMember(ub, orgB, "owner");
  const sa = await seedOrg(orgA, `a${freshId()}`, ua);
  const sb = await seedOrg(orgB, `b${freshId()}`, ub);
  a = sa.actor;
  b = sb.actor;
  inqA = sa.inquiry;
  srcA = sa.source;
  subA = sa.subsource;
  // org A's inquiry is owned; org B's stays unassigned (and overdue), so per-organisation counts differ.
  await env.DB.prepare("update inquiries set owner_id = ? where id = ?").bind(ua, inqA).run();
});

describe("organisation isolation", () => {
  test("lists, details and searches show only the actor's organisation", async () => {
    const pageB = await listInquiriesPage(db(), b, { view: "all", page: 1 } as never);
    expect(pageB.rows.map((r) => r.id)).not.toContain(inqA);
    expect(await getInquiryDetail(db(), orgB, inqA)).toBeNull();
    expect(await getInquiryDetail(db(), orgA, inqA)).not.toBeNull();
    const companies = await searchCompanies(db(), orgB, "Company a");
    expect(companies).toEqual([]);
    const owners = await listOwners(db(), orgB);
    expect(owners.map((o) => o.id)).not.toContain(a.userId);
  });

  test("org B cannot change org A's inquiry", async () => {
    const svc = createInquiriesService(db(), orgB);
    expect(await svc.changeStage(inqA, "new", "contacted", {}, b)).toEqual({ ok: false, code: "stale" });
    expect(await svc.addActivity(inqA, { type: "note", note: "x" }, b)).toEqual({ ok: false, code: "stale" });
    expect(await svc.setFollowUp(inqA, Date.now(), b)).toEqual({ ok: false, code: "stale" });
    expect((await svc.claim(inqA, b)).ok).toBe(false);
    expect((await svc.assign(inqA, a.userId, b.userId, b)).ok).toBe(false);
    expect((await svc.updateContact(inqA, { contactName: "Hacked" }, b)).ok).toBe(false);
    const detail = await getInquiryDetail(db(), orgA, inqA);
    expect(detail?.contactName).not.toBe("Hacked");
    expect(detail?.stage).toBe("new");
  });

  test("an inquiry cannot be owned by someone outside the organisation", async () => {
    const svc = createInquiriesService(db(), orgA);
    expect((await svc.assign(inqA, a.userId, b.userId, a)).ok).toBe(false);
  });

  test("org B cannot read or change org A's sources", async () => {
    const sources = createSourcesService(db(), orgB);
    const all = await sources.listAll();
    expect(all.sources.map((s) => s.id)).not.toContain(srcA);
    expect(all.subsources.map((s) => s.id)).not.toContain(subA);
    expect((await sources.rename(srcA, "Hacked", b)).ok).toBe(false);
    expect((await sources.setActive(srcA, false, b)).ok).toBe(false);
    expect((await sources.addSubsource(srcA, { key: "x", label: "X" }, b)).ok).toBe(false);
    expect((await sources.renameSubsource(subA, "Hacked", b)).ok).toBe(false);
    expect((await sources.setSubsourceActive(subA, false, b)).ok).toBe(false);
  });

  test("ingest in org B cannot use org A's source", async () => {
    const res = await createInquiriesService(db(), orgB).ingest(
      { source: (await createSourcesService(db(), orgA).listAll()).sources[0]!.key, contact: { name: "X" }, nextFollowUpAt: Date.now(), createdVia: "manual" },
      b,
    );
    expect(res).toEqual({ ok: false, code: "inactive_source" });
  });

  test("unassigned counts are per organisation", async () => {
    expect(await unassignedCounts(db(), orgA)).toEqual({ total: 0, overdue: 0 });
    expect(await unassignedCounts(db(), orgB)).toEqual({ total: 1, overdue: 1 });
  });

  test("new rows carry the organisation", async () => {
    const row = await env.DB.prepare("select organization_id as org from inquiries where id = ?").bind(inqA).first<{ org: string }>();
    expect(row?.org).toBe(orgA);
    const act = await env.DB.prepare("select count(*) as n from inquiry_activities where inquiry_id = ? and organization_id = ?")
      .bind(inqA, orgA)
      .first<{ n: number }>();
    expect(act?.n).toBeGreaterThan(0);
  });
});
