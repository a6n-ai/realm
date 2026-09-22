"use server";

import { revalidatePath } from "next/cache";
import { ValidationError, type RoleValue } from "@foundry/commons";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/guards";
import { resolveActingOrgId } from "@/lib/services/org-scope";
import { inviteUser } from "@/lib/services/users-invite";
import { usersService, type UserStatusValue } from "@/lib/services/users.service";

const PATH = "/dashboard/settings/users";

export async function setUserStatus(publicId: string, status: UserStatusValue): Promise<void> {
  await requirePermission({ staff: ["suspend"] });
  await usersService.setStatus(publicId, status);
  revalidatePath(PATH);
}

export async function setUserRole(publicId: string, role: RoleValue): Promise<void> {
  await requirePermission({ user: ["set-role"] });
  await usersService.setRole(publicId, role);
  revalidatePath(PATH);
}

export async function removeUser(publicId: string): Promise<void> {
  await requirePermission({ staff: ["remove"] });
  await usersService.softDelete(publicId);
  revalidatePath(PATH);
}

export async function sendPasswordReset(email: string): Promise<void> {
  await requirePermission({ staff: ["invite"] });
  if (!email || email.endsWith("@deleted.invalid")) {
    throw new ValidationError("This account has no reachable email address.");
  }
  await auth.api.sendVerificationOTP({ body: { email, type: "forget-password" } });
}

export async function inviteUserAction(input: { email: string; name: string; role: string }): Promise<void> {
  await requirePermission({ staff: ["invite"], user: ["create", "set-role"] });
  // Same acting-org resolution the rest of the dashboard uses: the switcher's
  // activeOrganizationId if set, else the brand (default-location) org — nothing
  // sets activeOrganizationId at sign-in for a single-org admin.
  // Known follow-up (not fixed here): the invitee has no member row until they
  // accept, so a pending invite doesn't show in an org-scoped Users list; and
  // there's no Resend-invite action yet.
  const organizationId = await resolveActingOrgId();
  if (!organizationId) throw new ValidationError("No organization to invite into.");
  await inviteUser({
    email: input.email,
    name: input.name,
    role: input.role as "admin" | "member",
    organizationId,
  });
  revalidatePath(PATH);
}
