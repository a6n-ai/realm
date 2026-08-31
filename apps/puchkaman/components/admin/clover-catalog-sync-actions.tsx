"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, RefreshCwIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { apiFetch } from "@/lib/http/api-fetch";
import { toastSyncErrors } from "@/lib/http/sync-errors";
import { SyncLoadingOverlay } from "./sync-loading-overlay";

type SyncResponse = {
  direction: string;
  result: {
    categories?: { upserted: number; inactivated: number };
    modifierGroups?: { upserted: number; inactivated: number };
    modifiers?: { upserted: number; inactivated: number };
    discounts?: { upserted: number; inactivated: number };
    taxRates?: { upserted: number; inactivated: number };
    printerLabels?: { upserted: number; inactivated: number };
    menus?: { upserted: number; inactivated: number };
    created?: string[];
    updated?: string[];
    errors?: Array<{ entity?: string; message: string }>;
  };
};

export function CloverCatalogSyncActions({
  cloverConnected,
  showPushCategories = false,
}: {
  cloverConnected: boolean;
  showPushCategories?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"pull" | "push" | null>(null);

  async function run(direction: "pull" | "push_categories") {
    if (!cloverConnected) {
      toast.error("Connect Clover under Settings → Clover first.");
      return;
    }
    setBusy(direction === "pull" ? "pull" : "push");
    try {
      const res = await apiFetch<SyncResponse>("/api/inventory/sync/clover", {
        method: "POST",
        body: JSON.stringify({ direction }),
      });
      const r = res.result;
      if (direction === "pull") {
        toast.success(
          `Pulled: ${r.categories?.upserted ?? 0} categories, ${r.modifierGroups?.upserted ?? 0} modifier groups, ${r.discounts?.upserted ?? 0} discounts, ${r.taxRates?.upserted ?? 0} taxes, ${r.printerLabels?.upserted ?? 0} labels, ${r.menus?.upserted ?? 0} menus`,
        );
      } else {
        toast.success(
          `Pushed categories: ${r.created?.length ?? 0} created, ${r.updated?.length ?? 0} updated`,
        );
      }
      toastSyncErrors(r.errors);
      // Soft refresh: a hard reload would destroy the toast that just
      // reported what the sync did (or what Clover rejected).
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  const overlayLabel =
    busy === "pull"
      ? "Syncing catalog from Clover…"
      : busy === "push"
        ? "Pushing categories to Clover…"
        : "Syncing…";

  return (
    <>
      <SyncLoadingOverlay open={busy !== null} label={overlayLabel} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!cloverConnected || !!busy}
          onClick={() => void run("pull")}
        >
          {busy === "pull" ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-4" />
          )}
          Sync from Clover
        </Button>
        {showPushCategories ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!cloverConnected || !!busy}
            onClick={() => void run("push_categories")}
          >
            {busy === "push" ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <UploadIcon className="size-4" />
            )}
            Push categories
          </Button>
        ) : null}
      </div>
    </>
  );
}

/** Tiny color swatch for Clover colorCode (items/categories). */
