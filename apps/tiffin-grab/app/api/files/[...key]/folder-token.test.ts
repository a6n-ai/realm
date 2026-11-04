import { describe, expect, it } from "vitest";

import { SecuredAccessService } from "@foundry/storage";

// The route delegates to SecuredAccessService.validate; prove a folder token covers
// both files of that folder and nothing else.
const row = { path: "tickets/T1", accessKey: "k", accessTill: Date.now() + 1e6, accessLimit: null, accessedCount: 0 };
const db = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }),
  update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: 1 }] }) }) }),
} as never;

describe("folder token", () => {
  const svc = new SecuredAccessService(db);
  it("opens orig and thumb inside the folder", async () => {
    expect((await svc.validate("k", "tickets/T1/n1/orig-a.png")).ok).toBe(true);
    expect((await svc.validate("k", "tickets/T1/n1/thumb-a.png")).ok).toBe(true);
  });
  it("is refused for another entity folder, including a prefix-sharing sibling", async () => {
    expect(await svc.validate("k", "tickets/T2/n1/orig-a.png")).toEqual({ ok: false, reason: "path_mismatch" });
    expect(await svc.validate("k", "tickets/T10/n1/orig-a.png")).toEqual({ ok: false, reason: "path_mismatch" });
  });
});
