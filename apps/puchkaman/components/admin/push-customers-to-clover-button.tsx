"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { apiFetch } from "@/lib/http/api-fetch";
import { toastSyncErrors } from "@/lib/http/sync-errors";
import { SyncLoadingOverlay } from "./sync-loading-overlay";

type PushResponse = {
  direction: string;
  result: {
    pushed: number;
    skipped: number;
    errors?: Array<{ message: string }>;
  };
};

/** Header bulk action — push every unsynced app customer to Clover. */
export function PushCustomersToCloverButton({ cloverConnected }: { cloverConnected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!cloverConnected) {
      toast.error("Connect Clover under Settings → Clover first.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<PushResponse>("/api/customers/sync/clover/push", {
        method: "POST",
      });
      const r = res.result;
      toast.success(`Pushed ${r.pushed} customer${r.pushed === 1 ? "" : "s"} to Clover`);
      toastSyncErrors(r.errors);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SyncLoadingOverlay open={busy} label="Pushing customers to Clover…" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!cloverConnected || busy}
        onClick={() => void run()}
      >
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
        Sync all to Clover
      </Button>
    </>
  );
}
