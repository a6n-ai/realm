"use client";

import { useEffect, useTransition } from "react";
import { Button } from "@foundry/ui/button";
import { acceptInviteAction, dismissInviteAction } from "@/app/(customer)/me/friends/actions";

type Inviter = { displayUsername: string | null; name: string | null };

/** Shown while an invite cookie is waiting. Nothing is written until they press Accept. */
export function InviteBanner({ inviter }: { inviter: Inviter | null }) {
  const [pending, start] = useTransition();

  // A ref that no longer resolves (renamed, forged, own link): just forget it.
  useEffect(() => {
    if (!inviter) void dismissInviteAction();
  }, [inviter]);
  if (!inviter) return null;

  const who = inviter.name ?? `@${inviter.displayUsername}`;
  return (
    <div
      role="status"
      className="text-card-foreground mx-4 mt-4 flex flex-wrap items-center gap-3 border p-3.5 md:mx-6"
    >
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="font-semibold">{who}</span>
        {inviter.displayUsername ? <span className="text-muted-foreground"> @{inviter.displayUsername}</span> : null}{" "}
        invited you to be friends.
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => start(async () => void (await acceptInviteAction()))}>
          Accept
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => dismissInviteAction())}>
          Not now
        </Button>
      </div>
    </div>
  );
}
