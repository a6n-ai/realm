"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { apiFetch } from "@relay/engine/ui/api-fetch";

/** Pulls Delivered/Opened/Clicked from SES's CloudWatch counts; there is no per-event webhook for them. */
export function RefreshResultsButton({ campaignPublicId }: { campaignPublicId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      await apiFetch(`/api/notifications/campaigns/${campaignPublicId}/refresh-results`, { method: "POST" });
      toast.success("Results refreshed");
      router.refresh();
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={refresh} disabled={busy}>
      <RefreshCwIcon /> {busy ? "Refreshing…" : "Refresh results"}
    </Button>
  );
}
