import { describe, expect, it, vi } from "vitest";
import { Role } from "@foundry/commons";
import { inviteUser, type InviteDeps } from "../users-invite";

function deps(overrides: Partial<InviteDeps> = {}): InviteDeps {
  return {
    createUser: vi.fn(async () => ({ publicId: "usr_new", email: "ada@example.com" })),
    markPasswordUnset: vi.fn(async () => {}),
    sendResetOtp: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("inviteUser", () => {
  it("creates the user, clears passwordSet, then mails the OTP — in that order", async () => {
    const calls: string[] = [];
    const d = deps({
      createUser: vi.fn(async () => { calls.push("create"); return { publicId: "usr_new", email: "ada@example.com" }; }),
      markPasswordUnset: vi.fn(async () => { calls.push("mark"); }),
      sendResetOtp: vi.fn(async () => { calls.push("send"); }),
    });

    const result = await inviteUser({ email: "Ada@Example.com ", name: "Ada", role: Role.MEMBER }, d);

    expect(calls).toEqual(["create", "mark", "send"]);
    expect(result).toEqual({ publicId: "usr_new", email: "ada@example.com" });
  });

  it("normalizes the email to lowercase and trims it before creating", async () => {
    const d = deps();
    await inviteUser({ email: "  Ada@Example.com ", name: "Ada", role: Role.MEMBER }, d);
    expect(d.createUser).toHaveBeenCalledWith({ email: "ada@example.com", name: "Ada", role: Role.MEMBER });
  });

  it("never sends a password to createUser", async () => {
    const d = deps();
    await inviteUser({ email: "ada@example.com", name: "Ada", role: Role.MEMBER }, d);
    const arg = (d.createUser as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).not.toHaveProperty("password");
  });

  it("rejects an invalid email before touching anything", async () => {
    const d = deps();
    await expect(inviteUser({ email: "nope", name: "Ada", role: Role.MEMBER }, d)).rejects.toThrow(
      "Enter a valid email",
    );
    expect(d.createUser).not.toHaveBeenCalled();
  });

  it("rejects a blank name", async () => {
    const d = deps();
    await expect(inviteUser({ email: "ada@example.com", name: "  ", role: Role.MEMBER }, d)).rejects.toThrow(
      "Name is required",
    );
    expect(d.createUser).not.toHaveBeenCalled();
  });

  it("rejects a role that is not invitable", async () => {
    const d = deps();
    await expect(
      inviteUser({ email: "ada@example.com", name: "Ada", role: Role.USER }, d),
    ).rejects.toThrow("Unknown role");
    expect(d.createUser).not.toHaveBeenCalled();
  });

  it("maps the plugin's duplicate-email error to a readable message", async () => {
    const d = deps({
      createUser: vi.fn(async () => {
        throw new Error("User already exists. Use another email.");
      }),
    });
    await expect(
      inviteUser({ email: "ada@example.com", name: "Ada", role: Role.MEMBER }, d),
    ).rejects.toThrow("That email is already in use");
  });

  it("keeps the created account when the OTP mail fails, and says so", async () => {
    const d = deps({
      sendResetOtp: vi.fn(async () => {
        throw new Error("SES is down");
      }),
    });
    await expect(
      inviteUser({ email: "ada@example.com", name: "Ada", role: Role.MEMBER }, d),
    ).rejects.toThrow("Account created, but the invite email could not be sent");
    expect(d.markPasswordUnset).toHaveBeenCalled();
  });
});
