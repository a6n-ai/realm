import { describe, expect, it } from "vitest";
import { pickUserWritable } from "../users-writable";

describe("pickUserWritable", () => {
  it("keeps only name/email/phone/role", () => {
    const out = pickUserWritable({
      name: "A",
      email: "a@x.com",
      phone: "123",
      role: "member",
      passwordHash: "$2b$evil",
      emailVerified: new Date(),
      id: "x",
      createdBy: "y",
    });
    expect(out).toEqual({ name: "A", email: "a@x.com", phone: "123", role: "member" });
  });
  it("drops a raw passwordHash injection entirely", () => {
    expect(pickUserWritable({ passwordHash: "$2b$evil" })).toEqual({});
  });
  it("drops passwordSet, which is why markPasswordUnset bypasses update()", () => {
    // If this ever starts passing passwordSet through, usersService.markPasswordUnset
    // can collapse back into a plain update() call. Until then, an invite that used
    // update() would silently leave passwordSet true and let the invitee skip
    // choosing a password entirely.
    expect(pickUserWritable({ passwordSet: false })).toEqual({});
  });
});
