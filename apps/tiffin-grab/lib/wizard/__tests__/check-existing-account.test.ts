import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { deleteNonSystemUsers } from "@/db/test-helpers";
import { referrals, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const captcha = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/auth/captcha", () => ({ captchaPasses: async (t: string | null | undefined) => !captcha.on || t === "ok" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { checkExistingAccount } = await import("../actions");

async function reset() {
  // referrals rows point at users; clear them so the wipe can't FK-fail.
  await db.delete(referrals);
  await db.update(users).set({ referredByUserId: null });
  await deleteNonSystemUsers();
}

describe("checkExistingAccount", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(users).values({
      phone: "+16475550100",
      email: "existing@x.com",
      name: "Existing Customer",
      role: "user",
    });
  });
  afterAll(reset);

  it("returns matched for an email already tied to a customer account", async () => {
    const r = await checkExistingAccount("existing@x.com");
    expect(r).toEqual({ status: "matched" });
  });

  it("matches case-insensitively", async () => {
    const r = await checkExistingAccount("EXISTING@X.com");
    expect(r).toEqual({ status: "matched" });
  });

  it("returns new for an email with no account", async () => {
    const r = await checkExistingAccount("nobody@nowhere.invalid");
    expect(r).toEqual({ status: "new" });
  });

  it("returns new (not an error) for a malformed email", async () => {
    const r = await checkExistingAccount("not-an-email");
    expect(r).toEqual({ status: "new" });
  });

  it("returns staff for an email tied to a staff account", async () => {
    await db.insert(users).values({ phone: "+16475550199", email: "admin@x.com", name: "Admin", role: "admin" });
    expect(await checkExistingAccount("Admin@X.com")).toEqual({ status: "staff" });
  });

  it("never leaks fields beyond status", async () => {
    const r = await checkExistingAccount("existing@x.com");
    expect(Object.keys(r)).toEqual(["status"]);
  });
});

describe("checkExistingAccount refusals", () => {
  it("refuses without a captcha token, so an unthrottled caller learns nothing", async () => {
    await db.insert(users).values({ phone: "+16475550199", email: "probe@x.com", name: "Probe", role: "user" }).onConflictDoNothing();
    captcha.on = true;
    try {
      expect(await checkExistingAccount("probe@x.com")).toEqual({ error: expect.stringMatching(/Security check failed/) });
      await expect(checkExistingAccount("probe@x.com", "ok")).resolves.toEqual({ status: "matched" });
    } finally {
      captcha.on = false;
    }
  });

  it("refuses past the hourly cap per IP", async () => {
    let last: unknown;
    for (let i = 0; i < 35; i++) {
      last = await checkExistingAccount(`cap-${i}@x.com`);
    }
    expect(last).toEqual({ error: expect.stringMatching(/Too many attempts/) });
  });
});
