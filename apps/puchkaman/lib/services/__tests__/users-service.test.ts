import { describe, expect, it } from "vitest";
import { tombstoneEmail } from "../users.service";

describe("tombstoneEmail", () => {
  it("uses the reserved .invalid TLD so nothing can ever route mail to it", () => {
    expect(tombstoneEmail("usr_abc123")).toBe("deleted-usr_abc123@deleted.invalid");
  });

  it("is unique per user, so two deletions cannot collide on the unique index", () => {
    expect(tombstoneEmail("usr_a")).not.toBe(tombstoneEmail("usr_b"));
  });
});
