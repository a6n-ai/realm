import { afterAll, expect, test } from "vitest";

process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
const { getRedis } = await import("./redis");

test("getRedis returns a single shared connection", () => {
  expect(getRedis()).toBe(getRedis());
});

// lazyConnect means no socket opened; disconnect is just cleanup so vitest exits.
afterAll(() => getRedis().disconnect());
