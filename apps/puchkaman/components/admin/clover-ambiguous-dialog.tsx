"use client";

import { useState } from "react";
import { ResponsiveDialog } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { apiFetch } from "@/lib/http/api-fetch";
import type { CloverAmbiguousMatch } from "@/lib/sync/clover-inventory-sync.service";
import { CATEGORIES, type CategoryId } from "@/lib/menu-categories";

/**
 * Review queue for Clover pull matches that were not safe to auto-link
 * (name collision without unique name+price, or multiple locals).
 */
export function CloverAmbiguousDialog({
  queue,
  onDone,
}: {
  queue: CloverAmbiguousMatch[];
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selectedPublicId, setSelectedPublicId] = useState<string | null>(
    queue[0]?.candidates[0]?.publicId ?? null,
  );
  const current = queue[index];

  async function resolve(action: "link" | "link_adopt" | "create" | "skip") {
    if (!current) return;
    setBusy(true);
    try {
      await apiFetch("/api/products/sync/clover/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          incoming: current.incoming,
          existingPublicId:
            action === "link" || action === "link_adopt" ? selectedPublicId : undefined,
        }),
      });
      if (index + 1 < queue.length) {
        const next = index + 1;
        setIndex(next);
        setSelectedPublicId(queue[next]?.candidates[0]?.publicId ?? null);
      } else {
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onDone()}
      title="Link Clover item?"
      description={`${index + 1} of ${queue.length} — “${current.incoming.name}” may already exist locally. Clover is inventory source of truth.`}
      contentClassName="sm:max-w-xl"
    >
      <div className="grid gap-4 px-4 py-4">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">Clover item</p>
          <p>
            {current.incoming.name} · ${current.incoming.price.toFixed(2)} ·{" "}
            {CATEGORIES[current.incoming.category as CategoryId]?.name ?? current.incoming.category}
          </p>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            {current.incoming.cloverItemId}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Possible local products</p>
          {current.candidates.map((c) => (
            <label
              key={c.publicId}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                selectedPublicId === c.publicId ? "border-primary bg-primary/5" : ""
              }`}
            >
              <input
                type="radio"
                name="clover-match"
                className="mt-1"
                checked={selectedPublicId === c.publicId}
                onChange={() => setSelectedPublicId(c.publicId)}
              />
              <span className="min-w-0">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground block text-xs">
                  ${c.price.toFixed(2)} · {c.active ? "Active" : "Archived"} · match: {c.reason}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="grid gap-2">
          <Button
            type="button"
            disabled={busy || !selectedPublicId}
            onClick={() => void resolve("link_adopt")}
          >
            Link & adopt Clover inventory
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !selectedPublicId}
            onClick={() => void resolve("link")}
          >
            Link only (keep local name/price)
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void resolve("create")}>
            Create as new local product
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void resolve("skip")}>
            Skip for now
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
