"use client";

import { UserInviteDialog } from "@foundry/crm";
import { inviteUserAction } from "./actions";

// Thin client wrapper: the shared dialog takes the action as a prop so @foundry/crm
// stays free of app imports.
export function InviteUserButton({ roles }: { roles: { value: string; label: string }[] }) {
  return <UserInviteDialog roles={roles} onInvite={inviteUserAction} />;
}
