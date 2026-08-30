"use server";

import { revalidatePath } from "next/cache";
import { ValidationError, type RoleValue } from "@realm/commons";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/guards";
import { resolveActingOrgId } from "@/lib/services/integrations.service";
import { addMember } from "@/lib/services/organizations.service";
import { inviteUser } from "@/lib/services/users-invite";
import { usersService, type UserStatusValue } from "@/lib/services/users.service";

const PATH = "/dashboard/settings/users";

export async function setUserStatus(publicId: string, status: UserStatusValue): Promise<void> {
  // staff:suspend, NOT user:ban — the latter also authorizes the plugin's
  // /admin/ban-user endpoint, which this app deliberately does not mount.
  await requirePermission({ staff: ["suspend"] });
  // The self-suspension guard lives in the service, not here, so it holds for
  // every caller rather than just this button.
  await usersService.setStatus(publicId, status);
  revalidatePath(PATH);
}

export async function setUserRole(publicId: string, role: RoleValue): Promise<void> {
  await requirePermission({ user: ["set-role"] });
  await usersService.setRole(publicId, role);
  revalidatePath(PATH);
}

export async function removeUser(publicId: string): Promise<void> {
  // staff:remove, NOT user:delete — user:delete authorizes /admin/remove-user, a hard
  // delete that would orphan the orders and payments referencing this row.
  await requirePermission({ staff: ["remove"] });
  // Soft delete — never the plugin's removeUser, which is a hard delete and would
  // orphan the orders and payments that reference this row.
  await usersService.softDelete(publicId);
  revalidatePath(PATH);
}

export async function sendPasswordReset(email: string): Promise<void> {
  // staff:invite covers onboarding and recovery alike. user:set-password would also
  // authorize /admin/set-user-password — an admin issuing a password directly, which
  // is the exact out-of-band handoff this whole design avoids.
  await requirePermission({ staff: ["invite"] });
  if (!email || email.endsWith("@deleted.invalid")) {
    throw new ValidationError("This account has no reachable email address.");
  }
  // The admin never sees or issues a password: this mails the same 6-digit code the
  // user would get from Forgot password, and their existing one stays valid until
  // they complete the reset.
  await auth.api.sendVerificationOTP({ body: { email, type: "forget-password" } });
}

export async function inviteUserAction(input: { email: string; name: string; role: string }): Promise<void> {
  await requirePermission({ staff: ["invite"], user: ["create", "set-role"] });
  const created = await inviteUser({ email: input.email, name: input.name, role: input.role as RoleValue });
  // inviteUser only creates the users row (the global admin/member role) — it
  // has no org concept. Without this, an invited staff account had no member
  // row anywhere: invisible to a franchise-scoped Users list (needs a member
  // EXISTS row, see users.service.ts's queryUsers) and nothing in the org
  // switcher to work in. Scoped to whichever org the inviter currently has
  // active — inviting while Toronto is active adds them to Toronto only;
  // while the brand is active, brand membership cascades to every franchise
  // (see getMemberOrganizations), same as an existing brand admin.
  const orgId = await resolveActingOrgId();
  if (orgId) await addMember(orgId, created.publicId, "admin");
  revalidatePath(PATH);
}
