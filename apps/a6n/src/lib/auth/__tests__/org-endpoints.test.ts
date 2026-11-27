import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";

beforeAll(() => applyMigrations());

// Organisation changes go through the console's server functions (their own checks and guards), never straight
// through Better Auth's HTTP routes.
const BLOCKED = [
  "create", "delete", "update", "invite-member", "accept-invitation", "reject-invitation", "cancel-invitation", "leave",
  "remove-member", "update-member-role", "create-role", "update-role", "delete-role", "create-team", "update-team",
  "remove-team", "add-team-member", "remove-team-member",
];

describe("organization plugin HTTP routes", () => {
  for (const path of BLOCKED) {
    test(`/organization/${path} is not reachable`, async () => {
      const res = await SELF.fetch(`http://localhost/api/auth/organization/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: "{}",
      });
      expect(res.status).toBe(404);
    });
  }
});
