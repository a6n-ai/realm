"use client";

import { useState } from "react";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import type { DuplicateCandidate } from "@/lib/sync/menu-sync.service";
import { apiFetch } from "@/lib/http/api-fetch";

export function DuplicateDialog({
  queue,
  cloverConnected,
  onDone,
}: {
  queue: DuplicateCandidate[];
  /**
   * With a Clover merchant connected the only thing Uber can give a product is
   * its photo, so the choice collapses to "same product or not". Without one,
   * Uber is still the whole catalogue and the original three-way applies.
   */
  cloverConnected: boolean;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const current = queue[index];

  async function resolve(action: "replace" | "keep" | "skip") {
    setBusy(true);
    try {
      await apiFetch("/api/products/sync/resolve-duplicate", {
        method: "POST",
        body: JSON.stringify({
          existingPublicId: current.existingPublicId,
          action,
          incoming: current.incoming,
        }),
      });
      if (index + 1 < queue.length) setIndex((i) => i + 1);
      else onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onDone()}
      title={cloverConnected ? "Use this Uber Eats photo?" : "A similar product already exists"}
      description={
        cloverConnected
          ? `${index + 1} of ${queue.length} — “${current.incoming.name}” on Uber Eats looks like this product. Linking takes its photo; name, price and availability stay from Clover.`
          : `${index + 1} of ${queue.length} — “${current.incoming.name}” looks like it might already be on your menu.`
      }
      contentClassName="sm:max-w-xl"
    >
      <div className="grid gap-4 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <ProductPreview
            label={cloverConnected ? "On the site (from Clover)" : "Current website product"}
            name={current.existingName}
            price={current.existingPrice}
            imageUrl={current.existingImageUrl}
            extra={current.existingActive ? "Active" : "Archived"}
          />
          <ProductPreview
            label={cloverConnected ? "Uber Eats photo" : "Uber Eats product"}
            name={current.incoming.name}
            price={current.incoming.price}
            imageUrl={current.incoming.imageUrl}
          />
        </div>

        {cloverConnected ? (
          <div className="grid gap-2">
            <Button type="button" disabled={busy} onClick={() => void resolve("replace")}>
              Use this photo
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void resolve("skip")}
            >
              Not the same product
            </Button>
            <p className="text-muted-foreground text-xs">
              Nothing but the photo is copied. “Not the same product” leaves both alone — the
              next sync will ask again, since there is nowhere to record the answer yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            <Button type="button" disabled={busy} onClick={() => void resolve("replace")}>
              Replace existing with Uber Eats version
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void resolve("keep")}
            >
              Keep existing, just link it to Uber Eats
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void resolve("skip")}
            >
              Skip — treat as unrelated
            </Button>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

function ProductPreview({
  label,
  name,
  price,
  imageUrl,
  extra,
}: {
  label: string;
  name: string;
  price: number;
  imageUrl: string | null;
  extra?: string;
}) {
  return (
    <div className="bg-card rounded-lg border p-3">
      <p className="text-muted-foreground mb-2 text-sm">{label}</p>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="mb-2 aspect-[4/3] w-full rounded-md object-cover"
        />
      ) : (
        <div className="bg-muted mb-2 aspect-[4/3] w-full rounded-md" />
      )}
      <p className="text-sm font-medium">{name}</p>
      <p className="text-muted-foreground text-xs tabular-nums">
        ${Number(price).toFixed(2)}
        {extra ? ` · ${extra}` : ""}
      </p>
    </div>
  );
}
