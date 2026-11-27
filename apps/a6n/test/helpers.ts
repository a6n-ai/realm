import { env, SELF } from "cloudflare:test";
import { expect } from "vitest";
import { memoryMailer } from "../src/lib/mail/memory-mailer";
import type { Role } from "../src/lib/auth/permissions";

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

export async function insertUser(email: string, role: Role, status: "active" | "removed" = "active"): Promise<string> {
  const id = `usr_${freshId()}`;
  const now = Date.now();
  await env.DB.prepare(
    "insert into users (id, name, email, role, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, email, email, role, status, now, now)
    .run();
  return id;
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
