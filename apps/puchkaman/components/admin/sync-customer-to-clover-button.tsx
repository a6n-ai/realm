"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SearchIcon, UploadIcon, UserCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import {
  linkCustomerToCloverAction,
  pushCustomerToCloverAction,
  searchCloverCustomersAction,
} from "@/app/(dashboard)/dashboard/customers/actions";

type CloverMatch = { publicId: string; name: string; email: string | null; phone: string | null };

/** Per-row Clover sync: search for an existing Clover customer to link before creating a new one. */
export function SyncCustomerToCloverButton({
  publicId,
  defaultQuery,
}: {
  publicId: string;
  defaultQuery: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<CloverMatch[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [acting, startAction] = useTransition();
  // Two-step confirm — either an existing Clover customer to link, or "create new".
  const [confirming, setConfirming] = useState<CloverMatch | "create" | null>(null);

  function search(q: string) {
    setQuery(q);
    setResults(null);
    if (!q.trim()) return;
    startSearch(async () => {
      try {
        setResults(await searchCloverCustomersAction(q));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Search failed");
      }
    });
  }

  function confirmLink(match: CloverMatch) {
    startAction(async () => {
      try {
        await linkCustomerToCloverAction(publicId, match.publicId);
        toast.success(`Linked to ${match.name} on Clover`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not link customer");
      } finally {
        setConfirming(null);
      }
    });
  }

  function confirmCreate() {
    startAction(async () => {
      try {
        await pushCustomerToCloverAction(publicId);
        toast.success("Customer pushed to Clover");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Sync failed");
      } finally {
        setConfirming(null);
      }
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) search(defaultQuery);
        else {
          setResults(null);
          setConfirming(null);
        }
      }}
      trigger={
        <Button type="button" variant="outline" size="sm" className="h-7 px-2">
          <UploadIcon className="size-3.5" />
          Sync to Clover
        </Button>
      }
      title="Sync to Clover"
      description="Check for an existing Clover customer before creating a new one."
    >
      <div className="space-y-3 p-4">
        {confirming ? (
          <div className="space-y-3 rounded-lg border p-3">
            {confirming === "create" ? (
              <p className="text-sm">
                No match picked — create a <strong>new</strong> Clover customer for this person?
              </p>
            ) : (
              <p className="text-sm">
                Link this customer to <strong>{confirming.name}</strong>
                {confirming.email ? ` (${confirming.email})` : ""} on Clover?
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={acting}
                onClick={() => (confirming === "create" ? confirmCreate() : confirmLink(confirming))}
              >
                {acting ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                Confirm
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={acting} onClick={() => setConfirming(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => search(e.target.value)}
                placeholder="Search Clover by name, email or phone…"
                className="pl-8"
              />
            </div>

            {searching ? (
              <p className="text-muted-foreground text-sm">Searching…</p>
            ) : results && results.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {results.map((r) => (
                  <li key={r.publicId} className="flex items-center justify-between gap-3 p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[r.email, r.phone].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(r)}>
                      <UserCheckIcon className="size-3.5" />
                      Link
                    </Button>
                  </li>
                ))}
              </ul>
            ) : query.trim() ? (
              <p className="text-muted-foreground text-sm">No matching Clover customers found.</p>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-center"
              onClick={() => setConfirming("create")}
            >
              None of these — create a new Clover customer
            </Button>
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
