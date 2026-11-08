import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withCronAuth } from "../auth";

const req = (authorization?: string) => new Request("http://x/api/cron/y", { headers: authorization ? { authorization } : {} });
const ok = withCronAuth(async () => Response.json({ ran: true }));

describe("withCronAuth", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await ok(req("Bearer "))).status).toBe(401);
  });

  it("rejects a missing, wrong or different-length bearer", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    for (const h of [undefined, "Bearer nope!!", "Bearer s3cre", "s3cret"]) expect((await ok(req(h))).status).toBe(401);
  });

  it("runs the handler on the right bearer", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await ok(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: true });
  });
});

describe("cron routes", () => {
  it("every route under app/api/cron is wrapped in withCronAuth (proxy.ts exempts the prefix)", () => {
    const root = join(process.cwd(), "app/api/cron");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      expect(readFileSync(join(root, dir.name, "route.ts"), "utf8"), dir.name).toContain("withCronAuth(");
    }
  });
});
