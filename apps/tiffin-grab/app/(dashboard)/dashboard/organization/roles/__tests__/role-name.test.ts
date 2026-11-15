import { describe, expect, it } from "vitest";
import { validateRoleName } from "../role-name";

describe("validateRoleName", () => {
  it("accepts lowercase letters, digits and hyphens after trimming", () => {
    expect(validateRoleName("  front-desk-2 ")).toBeUndefined();
  });

  it("refuses empty, too long, malformed and built-in names", () => {
    expect(validateRoleName("   ")).toBe("Enter a role name.");
    expect(validateRoleName("a".repeat(41))).toBe("Use 40 characters or fewer.");
    expect(validateRoleName("a".repeat(40))).toBeUndefined();
    expect(validateRoleName("Front Desk")).toBe("Use lowercase letters, digits and hyphens only.");
    expect(validateRoleName("admin")).toBe(`"admin" is a built-in role. Choose another name.`);
  });
});
