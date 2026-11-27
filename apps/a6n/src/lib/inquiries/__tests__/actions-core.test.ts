import { actorOf } from "../../../../test/helpers";
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { depsFor } from "../../deps";
import { runAssign, runClaim, runCreateInquiry } from "../actions-core";

const NOW = Date.now();
const sales = actorOf("usr_sales", "Sam", "sales");
const admin = actorOf("usr_boss", "Ada", "admin");

beforeAll(applyMigrations);

beforeEach(async () => {
  const user = (id: string, role: string) =>
    env.DB.prepare("insert into users (id, name, email, role, status, created_at, updated_at) values (?, ?, ?, ?, 'active', ?, ?)").bind(id, id, `${id}@x.io`, role, NOW, NOW);
  await env.DB.batch([
    env.DB.prepare("delete from inquiry_activities"),
    env.DB.prepare("delete from inquiries"),
    env.DB.prepare("delete from companies"),
    env.DB.prepare("delete from lead_subsources"),
    env.DB.prepare("delete from lead_sources"),
    env.DB.prepare("delete from users"),
    user("usr_sales", "sales"),
    user("usr_boss", "admin"),
    env.DB.prepare("insert into lead_sources (id, created_at, key, label, active) values ('lsr_cold', ?, 'cold', 'Cold', 1)").bind(NOW),
  ]);
});

describe("inquiry action cores", () => {
  test("sales calling runAssign is forbidden", async () => {
    const res = await runAssign(sales, depsFor(env), { id: "inq_x", fromOwnerId: null, toOwnerId: "usr_boss" });
    expect(res).toEqual({ ok: false, code: "forbidden" });
  });

  test("invalid input is rejected", async () => {
    const res = await runCreateInquiry(sales, depsFor(env), { contactName: "Ada", nextFollowUpAt: NOW + 1000 });
    expect(res).toEqual({ ok: false, code: "invalid" });
  });

  test("valid create returns the inquiry id, owned by the actor", async () => {
    const res = await runCreateInquiry(sales, depsFor(env), { source: "cold", contactName: "Ada", company: "Acme", nextFollowUpAt: NOW + 1000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.id).toMatch(/^inq_/);
    const row = await env.DB.prepare("select owner_id from inquiries where id = ?").bind(res.id).first<{ owner_id: string }>();
    expect(row?.owner_id).toBe("usr_sales");
  });

  test("an unknown source is a refusal, not a throw", async () => {
    const res = await runCreateInquiry(sales, depsFor(env), { source: "nope", contactName: "Ada", nextFollowUpAt: NOW + 1000 });
    expect(res).toEqual({ ok: false, code: "inactive_source" });
  });

  test("a second claim is refused", async () => {
    const made = await runCreateInquiry(admin, depsFor(env), { source: "cold", phone: "555", nextFollowUpAt: NOW + 1000 });
    if (!made.ok) throw new Error("setup");
    await env.DB.prepare("update inquiries set owner_id = null where id = ?").bind(made.id).run();
    expect(await runClaim(sales, depsFor(env), { id: made.id })).toEqual({ ok: true });
    expect(await runClaim(admin, depsFor(env), { id: made.id })).toEqual({ ok: false, code: "already_claimed" });
  });
});
