"use server";

import { revalidatePath } from "next/cache";
import { ValidationError, type RoleValue } from "@foundry/commons";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
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
  const session = await getSession();
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) throw new ValidationError("No active organization for this session.");
  await inviteUser({
    email: input.email,
    name: input.name,
    role: input.role as "admin" | "member",
    organizationId,
  });
  revalidatePath(PATH);
}
