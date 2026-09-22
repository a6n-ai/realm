import { describe, expect, it, vi } from "vitest";
import { acceptInvitationAction } from "../actions";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      signInEmailOTP: vi.fn().mockResolvedValue({
        headers: new Headers([["set-cookie", "better-auth.session_token=tok_1; Path=/; HttpOnly"]]),
        response: { user: { id: "u_1" } },
      }),
      acceptInvitation: vi.fn().mockResolvedValue({ member: { id: "m_1" } }),
    },
  },
}));

describe("acceptInvitationAction", () => {
  it("signs in with the OTP then accepts the invitation with the session cookie from sign-in", async () => {
    const { auth } = await import("@/lib/auth");
    const result = await acceptInvitationAction({ invitationId: "inv_1", email: "a@x.com", otp: "123456" });
    expect(auth.api.signInEmailOTP).toHaveBeenCalledWith(
      expect.objectContaining({ body: { email: "a@x.com", otp: "123456" }, returnHeaders: true }),
    );
    const acceptCall = vi.mocked(auth.api.acceptInvitation).mock.calls[0][0] as {
      body: { invitationId: string };
      headers: Headers;
    };
    expect(acceptCall.body).toEqual({ invitationId: "inv_1" });
    // The regression this guards: acceptInvitation must carry the Set-Cookie
    // issued by signInEmailOTP, not the pre-signin request headers.
    expect(acceptCall.headers.get("cookie")).toContain("better-auth.session_token=tok_1");
    expect(result).toEqual({ ok: true });
  });
});
