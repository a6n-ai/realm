"use client";

import { UserInviteDialog } from "@foundry/crm";
import { inviteUserFormAction } from "./actions";

export function InviteUserButton({ roles }: { roles: { value: string; label: string }[] }) {
  return (
    <UserInviteDialog
      roles={roles}
      onInvite={async (input) => {
        const result = await inviteUserFormAction(input);
        if (result) throw new Error(result.error);
      }}
    />
  );
}
