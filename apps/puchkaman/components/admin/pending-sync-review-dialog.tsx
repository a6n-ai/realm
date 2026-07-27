"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FileDetail } from "@realm/storage/model";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import type { PendingSync } from "@/db/schema/products";
import { apiFetch } from "@/lib/http/api-fetch";

type Product = {
  publicId: string;
  name: string;
  description: string | null;
  price: number;
  image: FileDetail | null;
  pendingSync: PendingSync | null;
};

type Action =
  | "apply_name"
  | "apply_description"
  | "apply_price"
  | "apply_image"
  | "apply_all"
  | "ignore";

export function PendingSyncReviewDialog({
  product,
  onOpenChange,
}: {
  product: Product | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const pending = product?.pendingSync;

  async function apply(action: Action) {
    if (!product) return;
    setBusy(action);
    try {
      await apiFetch(`/api/products/${product.publicId}/resolve-sync`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      router.refresh();
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ResponsiveDialog
      open={!!product}
      onOpenChange={onOpenChange}
      title="Updates available"
      description={
        product
          ? `Uber Eats has different info for “${product.name}”. Nothing changes until you choose.`
          : undefined
      }
      contentClassName="sm:max-w-lg"
    >
      {product && pending ? (
        <div className="grid gap-4 px-4 py-4">
          <div className="grid gap-3">
            {pending.name !== undefined ? (
              <DiffRow label="Name" from={product.name} to={pending.name} />
            ) : null}
            {"description" in pending ? (
              <DiffRow
                label="Description"
                from={product.description ?? "—"}
                to={pending.description ?? "—"}
              />
            ) : null}
            {pending.price !== undefined ? (
              <DiffRow
                label="Price"
                from={`$${product.price.toFixed(2)}`}
                to={`$${pending.price.toFixed(2)}`}
              />
            ) : null}
            {"imageUrl" in pending ? (
              <div className="grid grid-cols-2 gap-3">
                <ImagePreview label="Current" url={product.image?.url ?? null} />
                <ImagePreview label="Proposed" url={pending.imageUrl ?? null} />
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Button
              type="button"
              disabled={!!busy}
              onClick={() => void apply("apply_all")}
            >
              {busy === "apply_all" ? "Applying…" : "Update everything"}
            </Button>
            <div className="grid gap-2 sm:grid-cols-2">
              {pending.name !== undefined ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => void apply("apply_name")}
                >
                  Update name
                </Button>
              ) : null}
              {"description" in pending ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => void apply("apply_description")}
                >
                  Update description
                </Button>
              ) : null}
              {pending.price !== undefined ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => void apply("apply_price")}
                >
                  Update price
                </Button>
              ) : null}
              {"imageUrl" in pending ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => void apply("apply_image")}
                >
                  Update image
                </Button>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!!busy}
              onClick={() => void apply("ignore")}
            >
              Ignore — keep my current version
            </Button>
          </div>
        </div>
      ) : null}
    </ResponsiveDialog>
  );
}

function DiffRow({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
      <p className="text-muted-foreground text-sm">{label}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground line-through">{from}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-medium">{to}</span>
      </div>
    </div>
  );
}

function ImagePreview({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-sm">{label}</p>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="aspect-[4/3] w-full rounded-md border object-cover" />
      ) : (
        <div className="bg-muted aspect-[4/3] w-full rounded-md border" />
      )}
    </div>
  );
}
