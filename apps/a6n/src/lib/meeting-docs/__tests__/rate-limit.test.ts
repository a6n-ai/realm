import { env } from "cloudflare:test";
import { beforeAll, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { getDb } from "../../../db/client";
import { hitRateLimit } from "../rate-limit";

const NOW = Date.now();
const hit = (key: string, at = NOW) => hitRateLimit(getDb(env), key, 3, 1000, at);

beforeAll(applyMigrations);

test("allows max hits per window then refuses", async () => {
  expect([await hit("collab:a"), await hit("collab:a"), await hit("collab:a"), await hit("collab:a")]).toEqual([true, true, true, false]);
  expect(await hit("collab:a", NOW + 1001)).toBe(true);
});

test("keys are independent", async () => {
  for (let i = 0; i < 4; i++) await hit("collab:b");
  expect(await hit("collab:c")).toBe(true);
});
