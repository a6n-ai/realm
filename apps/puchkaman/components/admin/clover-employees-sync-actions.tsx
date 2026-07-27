"use client";

import { useState } from "react";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { apiFetch } from "@/lib/http/api-fetch";
import { SyncLoadingOverlay } from "./sync-loading-overlay";

type SyncResponse = {
  direction: string;
  result: {
    upserted?: number;
    inactivated?: number;
    errors?: Array<{ message: string }>;
  };
};

export function CloverEmployeesSyncActions({
  cloverConnected,
}: {
  cloverConnected: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!cloverConnected) {
      toast.error("Connect Clover under Settings → Clover first.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<SyncResponse>("/api/employees/sync/clover", {
        method: "POST",
      });
      const r = res.result;
      toast.success(
        `Pulled ${r.upserted ?? 0} employees${
          r.inactivated ? ` (${r.inactivated} inactivated)` : ""
        }`,
      );
      if (r.errors?.length) {
        toast.warning(`${r.errors.length} sync warning(s)`);
      }
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SyncLoadingOverlay open={busy} label="Syncing employees from Clover…" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!cloverConnected || busy}
        onClick={() => void run()}
      >
        {busy ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-4" />
        )}
        Sync from Clover
      </Button>
    </>
  );
}
