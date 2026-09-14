import { describe, expect, it } from "vitest";
import { decideSessionAdmission } from "../index";

describe("decideSessionAdmission", () => {
  it("admits an active customer", () => {
    expect(decideSessionAdmission({ role: "user", status: "active" })).toEqual({ ok: true });
  });

  it("admits active staff", () => {
    expect(decideSessionAdmission({ role: "admin", status: "active" })).toEqual({ ok: true });
    expect(decideSessionAdmission({ role: "member", status: "active" })).toEqual({ ok: true });
  });

  it.each(["inactive", "suspended", "deleted"])("refuses a customer whose status is %s", (status) => {
    expect(decideSessionAdmission({ role: "user", status }).ok).toBe(false);
  });

  it.each(["inactive", "suspended", "deleted"])("refuses staff whose status is %s", (status) => {
    expect(decideSessionAdmission({ role: "admin", status }).ok).toBe(false);
  });

  it("admits when the row is missing so a lookup miss cannot lock everyone out", () => {
    expect(decideSessionAdmission(undefined)).toEqual({ ok: true });
  });
});
