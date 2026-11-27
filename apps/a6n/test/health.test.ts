import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";

test("health reports db and relay", async () => {
  const res = await SELF.fetch("http://localhost/api/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, db: true, relay: "bound" });
});
