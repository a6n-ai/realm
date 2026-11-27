import { env, SELF } from "cloudflare:test";
import { expect } from "vitest";
import { memoryMailer } from "../src/lib/mail/memory-mailer";
import type { Actor } from "../src/lib/auth/actor";
import { builtInPermissions, type OrgRole } from "../src/lib/auth/permissions";

export const BASE = "http://localhost/api/auth";
export const json = { "content-type": "application/json" };
export const headersFor = (cookie: string) => new Headers({ cookie });

let seq = 0;
export const freshId = () => `${Date.now().toString(36)}${(seq += 1)}`;

// Each call gets its own client IP so the per-IP OTP limit never trips across tests.
export function freshIp(): Record<string, string> {
  seq += 1;
  return { "cf-connecting-ip": `10.1.${Math.floor(seq / 250)}.${(seq % 250) + 1}` };
}

// Every test user lives in one shared organisation unless a test builds its own. "sales" is the old name for member.
export const TEST_ORG = "org_test";
type TestRole = OrgRole | "sales";
const orgRole = (r: TestRole): OrgRole => (r === "sales" ? "member" : r);

export async function ensureTestOrg(): Promise<string> {
  await env.DB.prepare("insert or ignore into organizations (id, name, slug, created_at) values (?, 'Test org', 'test-org', ?)")
    .bind(TEST_ORG, Date.now())
    .run();
  return TEST_ORG;
}

export async function insertUser(email: string, role: TestRole, status: "active" | "removed" = "active"): Promise<string> {
  const id = `usr_${freshId()}`;
  const now = Date.now();
  await env.DB.prepare(
    "insert into users (id, name, email, role, status, created_at, updated_at) values (?, ?, ?, 'user', ?, ?, ?)",
  )
    .bind(id, email, email, status, now, now)
    .run();
  if (status === "active") await addMember(id, await ensureTestOrg(), orgRole(role), now);
  return id;
}

/** An Actor as requireActor builds it, for unit tests of cores and services. */
export function actorOf(userId: string, name: string, role: TestRole, organizationId = TEST_ORG): Actor {
  const r = orgRole(role);
  return { userId, name, organizationId, role: r, permissions: builtInPermissions(r) };
}

export async function sendCode(email: string): Promise<string> {
  const sent = await SELF.fetch(`${BASE}/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { ...json, ...freshIp() },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  expect(sent.status).toBe(200);
  // The mail goes out after the response.
  await expect.poll(() => memoryMailer.lastCode(email)).toMatch(/^\d{6}$/);
  return memoryMailer.lastCode(email) as string;
}

export async function signInResponse(email: string): Promise<Response> {
  const otp = await sendCode(email);
  return SELF.fetch(`${BASE}/sign-in/email-otp`, {
    method: "POST",
    headers: { ...json, ...freshIp() },
    body: JSON.stringify({ email, otp }),
  });
}

export async function signIn(email: string): Promise<string> {
  const res = await signInResponse(email);
  expect(res.status).toBe(200);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

export async function insertOrg(slug = `org-${freshId()}`): Promise<string> {
  const id = `org_${freshId()}`;
  await env.DB.prepare("insert into organizations (id, name, slug, created_at) values (?, ?, ?, ?)").bind(id, slug, slug, Date.now()).run();
  return id;
}

export async function addMember(userId: string, organizationId: string, role = "member", at = Date.now()): Promise<string> {
  const id = `mem_${freshId()}`;
  await env.DB.prepare("insert into members (id, organization_id, user_id, role, created_at) values (?, ?, ?, ?, ?)")
    .bind(id, organizationId, userId, role, at)
    .run();
  return id;
}

/** Batchable statements: the shared test organisation and a membership in it (for tests that seed rows with SQL). */
export const orgStmt = () =>
  env.DB.prepare("insert or ignore into organizations (id, name, slug, created_at) values (?, 'Test org', 'test-org', ?)").bind(TEST_ORG, Date.now());
export const memberStmt = (userId: string, role = "member") =>
  env.DB.prepare("insert or ignore into members (id, organization_id, user_id, role, created_at) values (?, ?, ?, ?, ?)")
    .bind(`mem_${userId}`, TEST_ORG, userId, role, Date.now());
