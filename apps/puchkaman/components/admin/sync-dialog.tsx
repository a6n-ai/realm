"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { Label } from "@realm/ui/label";
import { Switch } from "@realm/ui/switch";
import { apiFetch } from "@/lib/http/api-fetch";
import type { SyncResult } from "@/lib/sync/menu-sync.service";
import { SyncSummary } from "./sync-summary";
import { DuplicateDialog } from "./duplicate-dialog";

export function SyncDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [resolvingDuplicates, setResolvingDuplicates] = useState(false);
  const [redownloadImages, setRedownloadImages] = useState(false);
  const [optimizeImages, setOptimizeImages] = useState(true);

  async function startSync() {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch<SyncResult>("/api/products/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redownloadImages, optimizeImages }),
      });
      setResult(res);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function handleClose(next: boolean) {
    if (!next) {
      setResult(null);
      router.refresh();
    }
    onOpenChange(next);
  }

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={handleClose}
        title="Sync menu from Uber Eats"
        description="Adds new items and flags changes for review. Live menu is never overwritten automatically."
        contentClassName="sm:max-w-xl"
        footer={
          result && !busy ? (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => void startSync()}>
                Sync again
              </Button>
              <Button type="button" onClick={() => handleClose(false)}>
                Done
              </Button>
            </div>
          ) : !result && !busy ? (
            <div className="flex justify-end">
              <Button type="button" className="gap-1.5" onClick={() => void startSync()}>
                <RefreshCwIcon className="size-3.5" />
                Start sync
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="grid gap-4 px-4 py-4">
          {!result && !busy ? (
            <>
              <p className="text-muted-foreground text-sm">
                Reads the current Uber Eats menu snapshot, adds anything new, and flags anything that
                looks changed for your review.
              </p>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="sync-redownload" className="font-medium">
                    Re-download all images
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Re-fetch every photo from Uber Eats — slower
                  </p>
                </div>
                <Switch
                  id="sync-redownload"
                  checked={redownloadImages}
                  onCheckedChange={setRedownloadImages}
                />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="sync-optimize" className="font-medium">
                    Optimize images
                  </Label>
                  <p className="text-muted-foreground text-xs">Resize + recompress to WebP</p>
                </div>
                <Switch
                  id="sync-optimize"
                  checked={optimizeImages}
                  onCheckedChange={setOptimizeImages}
                />
              </div>
            </>
          ) : null}

          {busy ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm font-medium">
              <Loader2Icon className="size-5 animate-spin" />
              Syncing your menu…
            </div>
          ) : null}

          {result && !busy ? (
            <div className="grid gap-4">
              <SyncSummary result={result} />
              {result.duplicates.length > 0 ? (
                <div className="bg-muted/40 rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">
                    {result.duplicates.length} item
                    {result.duplicates.length === 1 ? "" : "s"} look like products you already have.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setResolvingDuplicates(true)}
                  >
                    Review duplicates
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </ResponsiveDialog>

      {resolvingDuplicates && result ? (
        <DuplicateDialog
          queue={result.duplicates}
          onDone={() => {
            setResolvingDuplicates(false);
            setResult((r) => (r ? { ...r, duplicates: [] } : r));
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
