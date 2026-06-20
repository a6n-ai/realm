import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { describe, expect, it } from "vitest";
import { jwtCallback, sessionCallback } from "@/lib/auth/callbacks";

describe("jwtCallback", () => {
  it("copies the user's public id (usr_…) and role onto the token", () => {
    const token = jwtCallback({
      token: {} as JWT,
      user: { id: "usr_abc123", publicId: "usr_abc123", email: "a@x.com", name: null, role: "member" },
    });
    expect(token.id).toBe("usr_abc123");
    expect(token.role).toBe("member");
  });

  it("falls back to user.id when publicId is absent", () => {
    const token = jwtCallback({ token: {} as JWT, user: { id: "usr_xyz", role: "user" } });
    expect(token.id).toBe("usr_xyz");
  });

  it("leaves the token untouched when no user is present", () => {
    const token = jwtCallback({ token: { id: "usr_existing", role: "admin" } as JWT });
    expect(token.id).toBe("usr_existing");
  });
});

describe("sessionCallback", () => {
  it("sets session.user.id to the usr_… public id carried by the token", () => {
    const session = sessionCallback({
      session: { user: { id: "", role: "user" }, expires: "" } as unknown as Session,
      token: { id: "usr_abc123", role: "member" } as JWT,
    });
    expect(session.user.id).toBe("usr_abc123");
    expect(session.user.id).toMatch(/^usr_/);
    expect(session.user.role).toBe("member");
  });
});
