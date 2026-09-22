import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

// Same pattern as lib/auth/__tests__/otp-signup-disabled.integration.test.ts —
// capture the mailed OTP instead of sending real email, run everything else
// against the real better-auth instance/DB.
const sent = vi.hoisted(() => [] as { email: string; type: string; otp: string }[]);
vi.mock("@/lib/auth/security-events", () => ({
  sendAuthOtp: async (email: string, otp: string, type: string) => {
    sent.push({ email, type, otp });
  },
  sendVerification: async () => {},
  notifyPasswordChanged: async () => {},
  notifyNewLoginIfNewDevice: async () => {},
}));

const { db } = await import("@/db/client");
const { users, organization, member, invitation } = await import("@/db/schema");
const { auth } = await import("@/lib/auth");
const { acceptInvitationAction } = await import("../actions");

const MARK = "accept-invite-it";
const ORG_CLIENT_CODE = `${MARK}-org`;
const INVITEE = `${MARK}-invitee@example.test`;
const INVITER = `${MARK}-inviter@example.test`;

beforeEach(async () => {
  sent.length = 0;
});

afterEach(async () => {
  // member/invitation rows cascade-delete with the organization (see
  // db/schema/organizations.ts onDelete: "cascade").
  await db.delete(organization).where(like(organization.clientCode, `%${MARK}%`));
  await db.delete(users).where(like(users.email, `%${MARK}%`));
});

/**
 * Regression coverage for the two Critical bugs found in code review:
 * (1) getInvitation must not be called pre-signin (unfixable — the page no
 *     longer calls it at all, so there's nothing to assert there beyond "the
 *     action itself needs no prior session").
 * (2) acceptInvitation must run with a Headers object that actually carries
 *     the Set-Cookie better-auth's nextCookies() plugin issued from
 *     signInEmailOTP, not the pre-signin request headers. A mocked auth.api
 *     can't catch this — it never exercises real cookie propagation — so this
 *     runs against the real better-auth instance/DB, matching
 *     otp-signup-disabled.integration.test.ts's pattern.
 *
 * Fixtures are seeded directly (not via inviteUser/createStaffInvite) to keep
 * this test focused on the actions.ts session-propagation logic, not the
 * separate invite-send path.
 */
describe("acceptInvitationAction (integration)", () => {
  it("accepts a real invitation after signing in with the mailed OTP", async () => {
    const [org] = await db
      .insert(organization)
      .values({ name: "Accept Invite Test Org", clientCode: ORG_CLIENT_CODE, parentOrganizationId: null })
      .returning({ id: organization.id });

    const [inviter] = await db.insert(users).values({ email: INVITER, name: "Inviter", role: "admin" }).returning({ id: users.id });
    // No credential row — mirrors how createUser provisions an invited staff account.
    await db.insert(users).values({ email: INVITEE, name: "Invitee", role: "member", passwordSet: false });

    const [inv] = await db
      .insert(invitation)
      .values({
        organizationId: org.id,
        email: INVITEE,
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        inviterId: inviter.id,
      })
      .returning({ id: invitation.id });

    await auth.api.sendVerificationOTP({ body: { email: INVITEE, type: "sign-in" } });
    expect(sent).toHaveLength(1);

    const result = await acceptInvitationAction({
      invitationId: inv.id,
      email: INVITEE,
      otp: sent[0].otp,
    });

    expect(result).toEqual({ ok: true });

    const [memberRow] = await db
      .select({ id: member.id, organizationId: member.organizationId })
      .from(member)
      .where(eq(member.organizationId, org.id));
    expect(memberRow?.organizationId).toBe(org.id);

    const [invRow] = await db.select({ status: invitation.status }).from(invitation).where(eq(invitation.id, inv.id));
    expect(invRow?.status).toBe("accepted");
  });
});
