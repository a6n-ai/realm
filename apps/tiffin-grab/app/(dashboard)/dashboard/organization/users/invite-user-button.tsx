"use client";

import { UserInviteDialog } from "@realm/crm";
import { inviteUserAction } from "./actions";

export function InviteUserButton({ roles }: { roles: { value: string; label: string }[] }) {
  return <UserInviteDialog roles={roles} onInvite={inviteUserAction} />;
}
