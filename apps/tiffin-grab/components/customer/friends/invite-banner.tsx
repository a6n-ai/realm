"use client";

import { useEffect, useTransition } from "react";
import { Button } from "@/components/customer/kit";
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
    <div role="status" className="mx-auto mb-4 flex max-w-2xl flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{who}</span>
        {inviter.displayUsername ? <span className="text-[var(--muted-foreground)]"> @{inviter.displayUsername}</span> : null}{" "}
        invited you to be friends.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" pill pending={pending} onClick={() => start(async () => void (await acceptInviteAction()))}>
          Accept
        </Button>
        <Button variant="quiet" pill disabled={pending} onClick={() => start(() => dismissInviteAction())}>
          Not now
        </Button>
      </div>
    </div>
  );
}
