import { headers } from "next/headers";
import { createStaffInvite } from "@foundry/auth";
import { auth } from "@/lib/auth";
import { usersService } from "./users.service";

const { inviteStaff } = createStaffInvite({
  createUser: async ({ email, name, role }) => {
    // No `password` field on purpose. The admin plugin treats it as optional and, when
    // absent, creates the user with NO credential account at all — so there is no
    // password to generate, hash, or leak. /set-password creates the credential once
    // the invitee accepts and signs in.
    const res = await auth.api.createUser({ body: { email, name, role: role as "admin" | "member" } });
    const created = res.user as { id: string; publicId?: string; email: string };
    if (!created.publicId) throw new Error("createUser returned no publicId");
    return { publicId: created.publicId, email: created.email, id: created.id };
  },
  markPasswordUnset: (publicId) => usersService.markPasswordUnset(publicId),
  // better-auth's organization plugin exposes this invite-member endpoint as
  // `createInvitation` (route "/organization/invite-member"); it requires
  // headers, which the shared StaffInviteDeps shape doesn't carry.
  inviteMember: async (input) =>
    auth.api.createInvitation({
      body: { ...input.body, role: input.body.role as "admin" | "member" },
      headers: await headers(),
    }),
});

/**
 * Create a staff account with no credential and a real organization invitation.
 * The invitee proves email ownership via sign-in OTP against the accept-invitation
 * page, then sets their first password via the existing /set-password step.
 */
export async function inviteUser(input: { email: string; name: string; role: "admin" | "member"; organizationId: string }) {
  return inviteStaff(input);
}
