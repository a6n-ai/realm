import { env } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { addMember, freshId, headersFor, insertOrg, insertUser, signIn, TEST_ORG } from "../../../../test/helpers";
import { ConsoleError, refusing, requireActor, requirePlatformAdmin } from "../actor";

beforeAll(applyMigrations);

const rejects = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected rejection");
};

describe("requireActor", () => {
  test("401 without a session", async () => {
    const err = await rejects(requireActor(env, new Headers(), {}));
    expect(err).toBeInstanceOf(ConsoleError);
    expect((err as ConsoleError).status).toBe(401);
  });

  test("403 for a member on invitation:create", async () => {
    const email = `sales-${freshId()}@a6n.test`;
    await insertUser(email, "sales");
    const headers = headersFor(await signIn(email));
    const err = await rejects(requireActor(env, headers, { permission: "invitation:create" }));
    expect((err as ConsoleError).status).toBe(403);
  });

  test("403 for a write with a foreign Origin", async () => {
    const email = `admin-${freshId()}@a6n.test`;
    await insertUser(email, "admin");
    const headers = headersFor(await signIn(email));
    headers.set("origin", "https://evil.test");
    const err = await rejects(requireActor(env, headers, { permission: "invitation:create", write: true }));
    expect((err as ConsoleError).status).toBe(403);
  });

  test("admin with matching Origin gets an Actor", async () => {
    const email = `admin-${freshId()}@a6n.test`;
    const id = await insertUser(email, "admin");
    const headers = headersFor(await signIn(email));
    headers.set("origin", "http://localhost");
    await expect(requireActor(env, headers, { permission: "invitation:create", write: true })).resolves.toMatchObject({
      userId: id,
      name: email,
      organizationId: TEST_ORG,
      role: "admin",
      permissions: expect.arrayContaining(["invitation:create", "inquiry:assign"]),
    });
  });
});

describe("refusing", () => {
  const run = async () => "ran" as const;

  test("no session -> unauthorized", async () => {
    await expect(refusing(env, new Headers(), { permission: "inquiry:assign", write: true }, run)).resolves.toEqual({ ok: false, code: "unauthorized" });
  });

  test("sales on assign -> forbidden, not thrown", async () => {
    const email = `sales-${freshId()}@a6n.test`;
    await insertUser(email, "sales");
    const headers = headersFor(await signIn(email));
    await expect(refusing(env, headers, { permission: "inquiry:assign", write: true }, run)).resolves.toEqual({ ok: false, code: "forbidden" });
  });

  test("foreign origin -> bad_origin", async () => {
    const email = `admin-${freshId()}@a6n.test`;
    await insertUser(email, "admin");
    const headers = headersFor(await signIn(email));
    headers.set("origin", "https://evil.test");
    await expect(refusing(env, headers, { permission: "inquiry:assign", write: true }, run)).resolves.toEqual({ ok: false, code: "bad_origin" });
  });

  test("allowed actor runs the action", async () => {
    const email = `admin-${freshId()}@a6n.test`;
    await insertUser(email, "admin");
    const headers = headersFor(await signIn(email));
    await expect(refusing(env, headers, { permission: "inquiry:assign", write: true }, run)).resolves.toBe("ran");
  });
});

describe("organisation membership", () => {
  test("a custom role's permissions are honoured", async () => {
    const email = `lead-${freshId()}@a6n.test`;
    const id = await insertUser(email, "sales", "removed");
    await env.DB.prepare("update users set status = 'active' where id = ?").bind(id).run();
    const org = await insertOrg();
    await env.DB.prepare("insert into organization_roles (id, organization_id, role, permission, created_at) values (?, ?, 'lead', ?, ?)")
      .bind(`orl_${freshId()}`, org, JSON.stringify({ inquiry: ["read", "assign"] }), Date.now())
      .run();
    await addMember(id, org, "lead");
    const headers = headersFor(await signIn(email));
    await expect(requireActor(env, headers, { permission: "inquiry:assign" })).resolves.toMatchObject({ organizationId: org, role: "lead" });
    const err = await rejects(requireActor(env, headers, { permission: "inquiry:create" }));
    expect((err as ConsoleError).status).toBe(403);
  });

  test("a person with no organisation gets no_organization", async () => {
    const email = `none-${freshId()}@a6n.test`;
    const id = await insertUser(email, "sales");
    const headers = headersFor(await signIn(email));
    await env.DB.prepare("delete from members where user_id = ?").bind(id).run();
    const err = await rejects(requireActor(env, headers, {}));
    expect((err as ConsoleError).status).toBe(409);
    expect((err as ConsoleError).message).toBe("no_organization");
  });

  test("only a super_admin passes requirePlatformAdmin; everyone else gets 404", async () => {
    const email = `p-${freshId()}@a6n.test`;
    const id = await insertUser(email, "owner");
    const headers = headersFor(await signIn(email));
    expect(((await rejects(requirePlatformAdmin(env, headers))) as ConsoleError).status).toBe(404);
    await env.DB.prepare("update users set role = 'super_admin' where id = ?").bind(id).run();
    await expect(requirePlatformAdmin(env, headers)).resolves.toEqual({ userId: id });
  });
});
