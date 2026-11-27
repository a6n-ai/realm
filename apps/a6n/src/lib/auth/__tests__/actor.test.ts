import { env } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { freshId, headersFor, insertUser, signIn } from "../../../../test/helpers";
import { ConsoleError, requireActor } from "../actor";

beforeAll(applyMigrations);

const rejects = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected rejection");
};

describe("requireActor", () => {
  test("401 without a session", async () => {
    const err = await rejects(requireActor(env, new Headers(), {}));
    expect(err).toBeInstanceOf(ConsoleError);
    expect((err as ConsoleError).status).toBe(401);
  });

  test("403 for sales on team:manage", async () => {
    const email = `sales-${freshId()}@a6n.test`;
    await insertUser(email, "sales");
    const headers = headersFor(await signIn(email));
    const err = await rejects(requireActor(env, headers, { permission: "team:manage" }));
    expect((err as ConsoleError).status).toBe(403);
  });

  test("403 for a write with a foreign Origin", async () => {
    const email = `admin-${freshId()}@a6n.test`;
    await insertUser(email, "admin");
    const headers = headersFor(await signIn(email));
    headers.set("origin", "https://evil.test");
    const err = await rejects(requireActor(env, headers, { permission: "team:manage", write: true }));
    expect((err as ConsoleError).status).toBe(403);
  });

  test("admin with matching Origin gets an Actor", async () => {
    const email = `admin-${freshId()}@a6n.test`;
    const id = await insertUser(email, "admin");
    const headers = headersFor(await signIn(email));
    headers.set("origin", "http://localhost");
    await expect(requireActor(env, headers, { permission: "team:manage", write: true })).resolves.toEqual({
      userId: id,
      name: email,
      role: "admin",
    });
  });
});
