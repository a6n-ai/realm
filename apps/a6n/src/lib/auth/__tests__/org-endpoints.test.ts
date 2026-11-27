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
  // Reads too: they return every member's email and the teams, past the console's own gates.
  "list-members", "get-full-organization", "get-organization", "list-teams", "list-team-members", "list-user-teams",
  "list-roles", "get-role", "get-active-member", "get-active-member-role", "set-active-team",
];

describe("organization plugin HTTP routes", () => {
  for (const path of BLOCKED) {
    test(`/organization/${path} is not reachable`, async () => {
      // Read routes are GET, write routes POST: neither method may reach any of them.
      for (const method of ["GET", "POST"]) {
        const res = await SELF.fetch(`http://localhost/api/auth/organization/${path}`, {
          method,
          headers: { "content-type": "application/json", origin: "http://localhost" },
          body: method === "POST" ? "{}" : undefined,
        });
        expect(res.status, `${method} ${path}`).toBe(404);
      }
    });
  }
});
