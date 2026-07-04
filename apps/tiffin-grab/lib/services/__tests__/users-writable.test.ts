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
});
