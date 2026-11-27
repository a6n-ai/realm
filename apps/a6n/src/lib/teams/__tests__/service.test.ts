import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { actorOf, memberStmt, orgStmt, TEST_ORG } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { getDb } from "../../../db/client";
import { createTeamService } from "../../team/service";
import { createMemoryMailer } from "../../mail/memory-mailer";
import { createTeamsService } from "../service";

const NOW = Date.now();
const owner = actorOf("usr_o", "Olive", "owner");
const svc = (org = TEST_ORG) => createTeamsService(getDb(env), org);
const user = (id: string) =>
  env.DB.prepare("insert into users (id, name, email, role, status, created_at, updated_at) values (?, ?, ?, 'user', 'active', ?, ?)").bind(id, id, `${id}@x.io`, NOW, NOW);

beforeAll(applyMigrations);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("delete from audit_log"),
    env.DB.prepare("delete from team_members"),
    env.DB.prepare("delete from teams"),
    env.DB.prepare("delete from users"),
    user("usr_o"),
    user("usr_m"),
    user("usr_out"),
    orgStmt(),
    memberStmt("usr_o", "owner"),
    memberStmt("usr_m"),
    env.DB.prepare("insert or ignore into organizations (id, name, slug, created_at) values ('org_t2', 'T2', 't2', ?)").bind(NOW),
    env.DB.prepare("insert into members (id, organization_id, user_id, role, created_at) values ('mem_out', 'org_t2', 'usr_out', 'member', ?)").bind(NOW),
  ]);
});

const teamId = async (name: string) => (await svc().list()).find((t) => t.name === name)!.id;

describe("teams", () => {
  test("create, rename and delete; names unique per organisation", async () => {
    expect(await svc().create("North", owner)).toMatchObject({ ok: true });
    expect(await svc().create("north", owner)).toEqual({ ok: false, code: "name_taken" });
    expect(await svc().create("  ", owner)).toEqual({ ok: false, code: "invalid" });
    const id = await teamId("North");
    expect(await svc().rename(id, "South", owner)).toEqual({ ok: true });
    expect((await svc().list()).map((t) => t.name)).toEqual(["South"]);
    expect(await svc().remove(id, owner)).toEqual({ ok: true });
    expect(await svc().list()).toEqual([]);
  });

  test("members of the organisation can join several teams; outsiders cannot join", async () => {
    await svc().create("A", owner);
    await svc().create("B", owner);
    const [a, b] = [await teamId("A"), await teamId("B")];
    expect(await svc().addMember(a, "usr_m", owner)).toEqual({ ok: true });
    expect(await svc().addMember(b, "usr_m", owner)).toEqual({ ok: true });
    expect(await svc().addMember(a, "usr_m", owner)).toEqual({ ok: false, code: "already_in_team" });
    expect(await svc().addMember(a, "usr_out", owner)).toEqual({ ok: false, code: "not_a_member" });
    const teams = await svc().list();
    expect(teams.map((t) => [t.name, t.members.map((m) => m.userId)])).toEqual([["A", ["usr_m"]], ["B", ["usr_m"]]]);
    expect(await svc().removeMember(a, "usr_m", owner)).toEqual({ ok: true });
    expect((await svc().list()).find((t) => t.name === "A")?.members).toEqual([]);
  });

  test("another organisation's teams are invisible and unchangeable", async () => {
    await svc().create("Mine", owner);
    const id = await teamId("Mine");
    const other = svc("org_t2");
    const outsider = actorOf("usr_out", "Out", "owner", "org_t2");
    expect(await other.list()).toEqual([]);
    expect(await other.rename(id, "Taken", outsider)).toEqual({ ok: false, code: "not_found" });
    expect(await other.remove(id, outsider)).toEqual({ ok: false, code: "not_found" });
    expect(await other.addMember(id, "usr_out", outsider)).toEqual({ ok: false, code: "not_found" });
  });

  test("removing someone from the organisation takes them out of its teams", async () => {
    await svc().create("A", owner);
    const a = await teamId("A");
    await svc().addMember(a, "usr_m", owner);
    await createTeamService(getDb(env), TEST_ORG, createMemoryMailer(), "http://localhost").remove("usr_m", owner);
    expect((await svc().list())[0]?.members).toEqual([]);
  });
});
