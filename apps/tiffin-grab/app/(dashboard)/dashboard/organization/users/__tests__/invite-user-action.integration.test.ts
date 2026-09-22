import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like } from "drizzle-orm";

// Real better-auth + DB end to end: inviteUserAction -> acting-org resolution ->
// hasPermission pre-check -> createUser -> createInvitation. Only mail and the
// Next request scope are stubbed.
const sent = vi.hoisted(() => ({ otps: [] as { email: string; otp: string }[], invites: [] as string[] }));
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("@/lib/auth/security-events", () => ({
  sendAuthOtp: async (email: string, otp: string) => {
    sent.otps.push({ email, otp });
  },
  sendStaffInvitation: async ({ email }: { email: string }) => {
    sent.invites.push(email);
  },
  sendVerification: async () => {},
  notifyPasswordChanged: async () => {},
  notifyNewLoginIfNewDevice: async () => {},
}));
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { db } = await import("@/db/client");
const { users, organization, member, invitation, session } = await import("@/db/schema");
const { auth } = await import("@/lib/auth");
const { inviteUserAction } = await import("../actions");

const MARK = "invite-action-it";
const ADMIN = `${MARK}-admin@example.test`;
const INVITEE = `${MARK}-invitee@example.test`;

async function signInAs(email: string): Promise<Headers> {
  sent.otps.length = 0;
  await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
  const res = await auth.api.signInEmailOTP({
    body: { email, otp: sent.otps[0].otp },
    returnHeaders: true,
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return new Headers({ cookie });
}

let orgId: string;

beforeEach(async () => {
  // sendInvitationEmail builds the accept URL from this; better-auth swallows the
  // callback's throw, so without it the invite row exists but no mail is queued.
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  sent.otps.length = 0;
  sent.invites.length = 0;
  const [org] = await db
    .insert(organization)
    .values({ name: "Invite Action Org", clientCode: `${MARK}-org`, parentOrganizationId: null })
    .returning({ id: organization.id });
  orgId = org.id;
  const [admin] = await db
    .insert(users)
    .values({ email: ADMIN, name: "Admin", role: "admin", emailVerified: true })
    .returning({ id: users.id });
  await db.insert(member).values({ organizationId: orgId, userId: admin.id, role: "admin" });
  requestHeaders.current = await signInAs(ADMIN);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await db.delete(organization).where(like(organization.clientCode, `%${MARK}%`));
  await db.delete(users).where(like(users.email, `%${MARK}%`));
});

describe("inviteUserAction (integration)", () => {
  it("invites into the admin's org when the session has no activeOrganizationId", async () => {
    // The regression: nothing sets activeOrganizationId at sign-in for a single-org admin.
    const [s] = await db
      .select({ active: session.activeOrganizationId })
      .from(session)
      .innerJoin(users, eq(users.id, session.userId))
      .where(eq(users.email, ADMIN));
    expect(s.active).toBeNull();

    await inviteUserAction({ email: INVITEE, name: "Invitee", role: "member" });

    const [inv] = await db
      .select({ status: invitation.status, role: invitation.role })
      .from(invitation)
      .where(and(eq(invitation.organizationId, orgId), eq(invitation.email, INVITEE)));
    expect(inv).toEqual({ status: "pending", role: "member" });
    expect(sent.invites).toEqual([INVITEE]);

    const [invitee] = await db.select({ passwordSet: users.passwordSet }).from(users).where(eq(users.email, INVITEE));
    expect(invitee.passwordSet).toBe(false);
  });

  it("refuses an org the admin isn't a direct member of without creating an orphan account", async () => {
    const [other] = await db
      .insert(organization)
      .values({ name: "Other Org", clientCode: `${MARK}-other`, parentOrganizationId: null })
      .returning({ id: organization.id });
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, ADMIN));
    await db.update(session).set({ activeOrganizationId: other.id }).where(eq(session.userId, admin.id));

    await expect(inviteUserAction({ email: INVITEE, name: "Invitee", role: "member" })).rejects.toThrow(/can't invite staff/);

    expect(await db.select({ id: users.id }).from(users).where(eq(users.email, INVITEE))).toHaveLength(0);
  });
});
