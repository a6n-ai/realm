"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { createGrantEmail, retryGrantContactList } from "../actions";

export function CreateGrantEmailButton({ groupId, size }: { groupId: string; size?: "sm" }) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  const run = () =>
    start(async () => {
      try {
        const { campaignPublicId } = await createGrantEmail(groupId);
        router.push(`/dashboard/notifications/campaigns/${campaignPublicId}?step=content`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create the email");
      }
    });
  return (
    <Button size={size} onClick={run} disabled={busy}>
      {busy ? "Working..." : "Create email"}
    </Button>
  );
}

export function RetryGrantListButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  const run = () =>
    start(async () => {
      try {
        await retryGrantContactList(groupId);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not build the email list");
      }
    });
  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy}>
      Retry
    </Button>
  );
}
