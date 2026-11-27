import { env } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { freshId, headersFor, insertUser, signIn } from "../../../../test/helpers";
import { loadShell } from "../shell";

beforeAll(applyMigrations);

describe("loadShell", () => {
  test("without a cookie it is null", async () => {
    expect(await loadShell(env, new Headers())).toBeNull();
  });

  test("a signed-in user gets the user (with passwordSet) and the unassigned counts", async () => {
    const email = `s-${freshId()}@a6n.test`;
    await insertUser(email, "sales");
    const shell = await loadShell(env, headersFor(await signIn(email)));
    expect(shell?.user).toMatchObject({ email, platformRole: "user", passwordSet: false });
    expect(shell).toMatchObject({ organization: { id: "org_test" }, role: "member", platformAdmin: false });
    expect(shell?.permissions).toContain("inquiry:create");
    expect(shell?.permissions).not.toContain("inquiry:assign");
    expect(shell?.unassigned).toEqual({ total: expect.any(Number), overdue: expect.any(Number) });
  });
});
