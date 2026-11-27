import { describe, expect, test } from "vitest";
import { allows, type Permission, type Role } from "../permissions";

const MATRIX: [Permission, boolean, boolean][] = [
  ["inquiry:read", true, true],
  ["inquiry:create", true, true],
  ["inquiry:update", true, true],
  ["inquiry:note", true, true],
  ["inquiry:claim", true, true],
  ["inquiry:assign", true, false],
  ["source:manage", true, false],
  ["team:manage", true, false],
];

describe("allows", () => {
  for (const [permission, admin, sales] of MATRIX) {
    test(`${permission}: admin ${admin}, sales ${sales}`, () => {
      expect(allows("admin", permission)).toBe(admin);
      expect(allows("sales", permission)).toBe(sales);
    });
  }
  test("unknown role is denied", () => {
    expect(allows("nobody" as Role, "inquiry:read")).toBe(false);
  });
});
