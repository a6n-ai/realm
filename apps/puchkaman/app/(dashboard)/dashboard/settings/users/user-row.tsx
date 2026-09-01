"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Ban, CircleCheck, KeyRound, Trash2 } from "lucide-react";
import { Role, type RoleValue } from "@foundry/commons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { RowActions } from "@foundry/design-system";
import { RowActionTooltipButton } from "@/components/ds";
import { removeUser, sendPasswordReset, setUserRole, setUserStatus } from "./actions";
import type { UserStatusValue } from "@/lib/services/users.service";

export function RoleSelect({
  publicId,
  role,
  status,
  isSelf,
}: {
  publicId: string;
  role: RoleValue;
  status: UserStatusValue;
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();

  // Demoting yourself is how the last admin locks everyone out; the service refuses
  // it too, but a disabled control explains why before the click.
  if (isSelf) return <span className="text-muted-foreground text-xs uppercase">{role}</span>;
  // A removed account is a tombstone. Re-roling one would succeed silently — setRole
  // has no status guard — and mean nothing, since it can never hold a session again.
  if (status === "deleted") return <span className="text-muted-foreground text-xs uppercase">{role}</span>;

  return (
    <Select
      value={role}
      disabled={pending}
      onValueChange={(next) =>
        start(async () => {
          try {
            await setUserRole(publicId, next as RoleValue);
            toast.success("Role updated.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not change the role.");
          }
        })
      }
    >
      <SelectTrigger className="h-8 w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={Role.ADMIN}>Admin</SelectItem>
        <SelectItem value={Role.MEMBER}>Member</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function StatusActions({
  publicId,
  email,
  status,
  isSelf,
}: {
  publicId: string;
  email: string | null;
  status: UserStatusValue;
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();

  if (isSelf) return <span className="text-muted-foreground text-xs">You</span>;
  if (status === "deleted") return <span className="text-muted-foreground text-xs">Removed</span>;

  const next: UserStatusValue = status === "active" ? "suspended" : "active";
  const label = status === "active" ? "Suspend" : "Reactivate";

  const run = (fn: () => Promise<void>, ok: string, fail: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : fail);
      }
    });

  return (
    <RowActions>
      <RowActionTooltipButton
        icon={KeyRound}
        label="Send password reset"
        disabled={pending || !email}
        onClick={() =>
          run(
            () => sendPasswordReset(email as string),
            "Password reset code sent.",
            "Could not send the reset code.",
          )
        }
      />
      <RowActionTooltipButton
        icon={status === "active" ? Ban : CircleCheck}
        label={label}
        disabled={pending}
        onClick={() =>
          run(
            () => setUserStatus(publicId, next),
            next === "active" ? "Account reactivated." : "Account suspended and signed out.",
            "Could not change the account status.",
          )
        }
      />
      <RowActionTooltipButton
        icon={Trash2}
        label="Remove account"
        disabled={pending}
        onClick={() =>
          run(() => removeUser(publicId), "Account removed and signed out.", "Could not remove the account.")
        }
      />
    </RowActions>
  );
}
