import { describe, expect, it, vi } from "vitest";
import { acceptInvitationAction } from "../actions";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      signInEmailOTP: vi.fn().mockResolvedValue({ user: { id: "u_1" } }),
      acceptInvitation: vi.fn().mockResolvedValue({ member: { id: "m_1" } }),
    },
  },
}));

describe("acceptInvitationAction", () => {
  it("signs in with the OTP then accepts the invitation", async () => {
    const { auth } = await import("@/lib/auth");
    const result = await acceptInvitationAction({ invitationId: "inv_1", email: "a@x.com", otp: "123456" });
    expect(auth.api.signInEmailOTP).toHaveBeenCalledWith(expect.objectContaining({ body: { email: "a@x.com", otp: "123456" } }));
    expect(auth.api.acceptInvitation).toHaveBeenCalledWith(expect.objectContaining({ body: { invitationId: "inv_1" } }));
    expect(result).toEqual({ ok: true });
  });
});
