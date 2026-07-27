"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLineIcon, ArrowUpFromLineIcon, Loader2Icon } from "lucide-react";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { apiFetch } from "@/lib/http/api-fetch";
import type {
  CloverAmbiguousMatch,
  CloverPullResult,
  CloverPushResult,
} from "@/lib/sync/clover-inventory-sync.service";
import { CloverAmbiguousDialog } from "./clover-ambiguous-dialog";

type Direction = "pull" | "push";

type SyncResponse =
  | { direction: "pull"; result: CloverPullResult }
  | { direction: "push"; result: CloverPushResult };

export function CloverInventorySyncDialog({
  open,
  onOpenChange,
  cloverConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cloverConnected: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Direction | null>(null);
  const [response, setResponse] = useState<SyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ambiguousQueue, setAmbiguousQueue] = useState<CloverAmbiguousMatch[] | null>(null);

  async function run(direction: Direction) {
    setBusy(direction);
    setResponse(null);
    setError(null);
    try {
      const res = await apiFetch<SyncResponse>("/api/products/sync/clover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      setResponse(res);
      if (res.direction === "pull" && res.result.ambiguous.length > 0) {
        setAmbiguousQueue(res.result.ambiguous);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clover sync failed");
    } finally {
      setBusy(null);
    }
  }

  function handleClose(next: boolean) {
    if (!next) {
      setResponse(null);
      setError(null);
      router.refresh();
    }
    onOpenChange(next);
  }

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={handleClose}
        title="Sync Clover inventory"
        description="Clover is the inventory source of truth. Pull updates local products; push sends local edits to Clover."
        contentClassName="sm:max-w-xl"
        footer={
          (response || error) && !busy ? (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResponse(null);
                  setError(null);
                }}
              >
                Sync again
              </Button>
              <Button type="button" onClick={() => handleClose(false)}>
                Done
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="grid gap-4 px-4 py-4">
          {!response && !error && !busy ? (
            <>
              {!cloverConnected ? (
                <p className="text-warn text-sm">
                  Connect a Clover merchant under Settings → Clover before syncing inventory.
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Pull adopts Clover name/price/availability onto linked products and creates
                  missing ones. Uber-only items without a Clover match stay in the catalog as
                  out of stock — never deleted. Push updates linked Clover items; Uber-only
                  rows are skipped unless you link them first.
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  disabled={!cloverConnected || !!busy}
                  onClick={() => void run("pull")}
                >
                  <ArrowDownToLineIcon className="size-3.5" />
                  Pull from Clover
                </Button>
                <Button
                  type="button"
                  className="gap-1.5"
                  disabled={!cloverConnected || !!busy}
                  onClick={() => void run("push")}
                >
                  <ArrowUpFromLineIcon className="size-3.5" />
                  Push to Clover
                </Button>
              </div>
            </>
          ) : null}

          {busy ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm font-medium">
              <Loader2Icon className="size-5 animate-spin" />
              {busy === "pull" ? "Pulling inventory from Clover…" : "Pushing products to Clover…"}
            </div>
          ) : null}

          {error && !busy ? (
            <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-3 text-sm">
              {error}
            </div>
          ) : null}

          {response && !busy ? <CloverSyncSummary response={response} /> : null}
        </div>
      </ResponsiveDialog>

      {ambiguousQueue && ambiguousQueue.length > 0 ? (
        <CloverAmbiguousDialog
          queue={ambiguousQueue}
          onDone={() => {
            setAmbiguousQueue(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function CloverSyncSummary({ response }: { response: SyncResponse }) {
  if (response.direction === "pull") {
    const r = response.result;
    return (
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <Stat label="Created locally" value={r.created.length} />
        <Stat label="Updated from Clover" value={r.updated.length} />
        <Stat label="Auto-linked" value={r.linked.length} />
        <Stat label="Needs review" value={r.ambiguous.length} warn={r.ambiguous.length > 0} />
        <Stat label="Marked OOS" value={r.markedOutOfStock.length} />
        <Stat label="Unchanged" value={r.unchanged} />
        <Stat label="Skipped (hidden)" value={r.skippedHidden} />
        <Stat label="Errors" value={r.errors.length} warn={r.errors.length > 0} />
        {r.errors.length > 0 ? (
          <ul className="text-destructive col-span-full list-inside list-disc text-xs">
            {r.errors.slice(0, 8).map((e) => (
              <li key={`${e.item}-${e.message}`}>
                {e.item}: {e.message}
              </li>
            ))}
          </ul>
        ) : null}
      </dl>
    );
  }

  const r = response.result;
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <Stat label="Created on Clover" value={r.created.length} />
      <Stat label="Updated on Clover" value={r.updated.length} />
      <Stat label="Errors" value={r.errors.length} warn={r.errors.length > 0} />
      {r.errors.length > 0 ? (
        <ul className="text-destructive col-span-full list-inside list-disc text-xs">
          {r.errors.slice(0, 8).map((e) => (
            <li key={`${e.item}-${e.message}`}>
              {e.item}: {e.message}
            </li>
          ))}
        </ul>
      ) : null}
    </dl>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className={`font-mono text-lg tabular-nums ${warn ? "text-destructive" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
