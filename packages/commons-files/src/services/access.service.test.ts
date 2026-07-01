import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@tiffin/commons-drizzle";
import { AccessPathService } from "./access-path.service";
import { SecuredAccessService } from "./secured-access.service";

const url = process.env.DATABASE_URL;
const client = postgres(url ?? "");
const db = drizzle(client) as unknown as Database;

describe.skipIf(!url)("access services (integration)", () => {
  beforeAll(async () => {
    await client`create table if not exists files_access_path (
      id bigint primary key default next_id(),
      public_id text not null unique,
      created_at bigint not null default 0, created_by bigint,
      updated_at bigint not null default 0, updated_by bigint,
      resource_type text not null default 'static',
      access_name text, write_access boolean not null default false,
      path text not null default '', allow_sub_path_access boolean not null default true
    )`;
    await client`create table if not exists files_secured_access_key (
      id bigint primary key default next_id(),
      public_id text not null unique,
      created_at bigint not null default 0, created_by bigint,
      updated_at bigint not null default 0, updated_by bigint,
      path text not null, access_key text not null unique,
      access_till bigint not null, access_limit bigint,
      accessed_count bigint not null default 0
    )`;
  });

  beforeEach(async () => {
    await client`truncate table files_access_path restart identity`;
    await client`truncate table files_secured_access_key restart identity`;
  });

  afterAll(async () => {
    await client`drop table if exists files_access_path`;
    await client`drop table if exists files_secured_access_key`;
    await client.end();
  });

  it("static is public-read; secured needs a matching access row", async () => {
    const svc = new AccessPathService(db);
    expect(await svc.canRead("user", "any/thing", "static")).toBe(true);
    expect(await svc.canRead("user", "docs/x.pdf", "secured")).toBe(false);
    await client`insert into files_access_path (public_id, resource_type, access_name, path, allow_sub_path_access)
      values ('fap_1', 'secured', 'member', 'docs', true)`;
    expect(await svc.canRead("member", "docs/x.pdf", "secured")).toBe(true);
    expect(await svc.canRead("user", "docs/x.pdf", "secured")).toBe(false);
  });

  it("write needs write_access true", async () => {
    const svc = new AccessPathService(db);
    await client`insert into files_access_path (public_id, resource_type, access_name, write_access, path)
      values ('fap_2', 'static', 'admin', true, 'uploads')`;
    expect(await svc.canWrite("admin", "uploads/a.png", "static")).toBe(true);
    expect(await svc.canWrite("member", "uploads/a.png", "static")).toBe(false);
  });

  it("mint then validate honors expiry and limit", async () => {
    let t = 1000;
    const svc = new SecuredAccessService(db, () => t);
    const { accessKey } = await svc.mint("docs/x.pdf", { ttlSeconds: 10, limit: 1 });
    expect(await svc.validate(accessKey, "docs/x.pdf")).toEqual({ ok: true });
    expect(await svc.validate(accessKey, "docs/x.pdf")).toEqual({ ok: false, reason: "exhausted" });

    const { accessKey: k2 } = await svc.mint("docs/y.pdf", { ttlSeconds: 10 });
    t = 999_999;
    expect(await svc.validate(k2, "docs/y.pdf")).toEqual({ ok: false, reason: "expired" });

    expect(await svc.validate("nope", "docs/y.pdf")).toEqual({ ok: false, reason: "not_found" });
  });
});
