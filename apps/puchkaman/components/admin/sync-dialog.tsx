"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Loader2Icon, RefreshCwIcon, XIcon } from "lucide-react";
import { apiFetch } from "@/lib/http/api-fetch";
import type { SyncResult } from "@/lib/sync/menu-sync.service";
import { SyncSummary } from "./sync-summary";
import { DuplicateDialog } from "./duplicate-dialog";

export function SyncDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
      <Dialog.Root open={open} onOpenChange={handleClose}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(22,20,13,.55)", zIndex: 60, display: "grid", placeItems: "center", padding: 20 }}>
            <Dialog.Content className="card" style={{ width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", background: "var(--white)", padding: "clamp(20px,3vw,30px)" }}>
              <div className="flex between center" style={{ marginBottom: 8 }}>
                <Dialog.Title className="display" style={{ fontSize: "1.35rem" }}>
                  Sync menu from Uber Eats
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button className="icon-btn" aria-label="Close">
                    <XIcon size={16} />
                  </button>
                </Dialog.Close>
              </div>

              {!result && !busy && (
                <div style={{ display: "grid", gap: 16 }}>
                  <p style={{ fontWeight: 500, opacity: 0.8 }}>
                    Reads the current Uber Eats menu snapshot, adds anything new, and flags anything that looks
                    changed for your review. Nothing on your live menu is ever overwritten automatically.
                  </p>
                  <label className="flex center" style={{ gap: 8, fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={redownloadImages}
                      onChange={(e) => setRedownloadImages(e.target.checked)}
                    />
                    Re-download all images (re-fetch every photo from Uber Eats — slower)
                  </label>
                  <label className="flex center" style={{ gap: 8, fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={optimizeImages}
                      onChange={(e) => setOptimizeImages(e.target.checked)}
                    />
                    Optimize images (resize + recompress to WebP)
                  </label>
                  <button type="button" className="btn btn--red" onClick={startSync}>
                    <RefreshCwIcon size={16} /> Start sync
                  </button>
                </div>
              )}

              {busy && (
                <div className="flex center" style={{ gap: 10, padding: "30px 0", justifyContent: "center" }}>
                  <Loader2Icon size={20} className="admin-spin" />
                  <span style={{ fontWeight: 700 }}>Syncing your menu…</span>
                </div>
              )}

              {result && !busy && (
                <div style={{ display: "grid", gap: 16 }}>
                  <SyncSummary result={result} />
                  {result.duplicates.length > 0 && (
                    <div className="card" style={{ padding: 14, background: "var(--cream)" }}>
                      <p style={{ fontWeight: 700, marginBottom: 8 }}>
                        {result.duplicates.length} item{result.duplicates.length === 1 ? "" : "s"} look like products you
                        already have.
                      </p>
                      <button type="button" className="btn btn--yellow btn--sm" onClick={() => setResolvingDuplicates(true)}>
                        Review duplicates
                      </button>
                    </div>
                  )}
                  <div className="flex" style={{ gap: 10, justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn--white btn--sm" onClick={startSync}>
                      Sync again
                    </button>
                    <button type="button" className="btn btn--red btn--sm" onClick={() => handleClose(false)}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>

      {resolvingDuplicates && result && (
        <DuplicateDialog
          queue={result.duplicates}
          onDone={() => {
            setResolvingDuplicates(false);
            setResult((r) => (r ? { ...r, duplicates: [] } : r));
            router.refresh();
          }}
        />
      )}
    </>
  );
}
