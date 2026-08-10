"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { setUserStatus } from "./actions";
import type { UserStatusValue } from "@/lib/services/users.service";
import type { UserRow } from "@/lib/services/users.repository";

export function StatusActions({
  publicId,
  status,
  isSelf,
}: {
  publicId: string;
  // The full column type (includes "deleted"), not just the settable subset —
  // this only ever compares against "active" so a wider read-side type is safe.
  status: UserRow["status"];
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();

  // Your own row has no control at all — the service refuses it anyway, but a
  // disabled button explains why instead of failing on click.
  if (isSelf) return <span className="text-muted-foreground text-xs">You</span>;

  const next: UserStatusValue = status === "active" ? "suspended" : "active";
  const label = status === "active" ? "Suspend" : "Reactivate";

  return (
    <Button
      variant={status === "active" ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await setUserStatus(publicId, next);
            toast.success(
              next === "active" ? "Account reactivated." : "Account suspended and signed out.",
            );
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not change the account status.");
          }
        })
      }
    >
      {label}
    </Button>
  );
}
