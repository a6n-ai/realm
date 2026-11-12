"use client";

import { UserInviteDialog } from "@foundry/crm";
import { unwrapAction } from "@/lib/actions/unwrap";
import { inviteUserAction } from "./actions";

export function InviteUserButton({ roles }: { roles: { value: string; label: string }[] }) {
  return (
    <UserInviteDialog
      roles={roles}
      onInvite={async (input) => {
        await unwrapAction(inviteUserAction(input));
      }}
    />
  );
}
