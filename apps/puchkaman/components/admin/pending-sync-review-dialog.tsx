"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { XIcon } from "lucide-react";
import type { FileDetail } from "@realm/storage/model";
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

type Action = "apply_name" | "apply_description" | "apply_price" | "apply_image" | "apply_all" | "ignore";

export function PendingSyncReviewDialog({ product, onOpenChange }: { product: Product | null; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const pending = product?.pendingSync;

  async function apply(action: Action) {
    if (!product) return;
    setBusy(action);
    try {
      await apiFetch(`/api/products/${product.publicId}/resolve-sync`, { method: "POST", body: JSON.stringify({ action }) });
      router.refresh();
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog.Root open={!!product} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(22,20,13,.55)", zIndex: 65, display: "grid", placeItems: "center", padding: 20 }}>
          {product && pending && (
            <Dialog.Content className="card" style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", background: "var(--white)", padding: "clamp(20px,3vw,30px)" }}>
              <div className="flex between center" style={{ marginBottom: 16 }}>
                <Dialog.Title className="display" style={{ fontSize: "1.2rem" }}>
                  Updates available
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button className="icon-btn" aria-label="Close">
                    <XIcon size={16} />
                  </button>
                </Dialog.Close>
              </div>

              <p style={{ fontWeight: 500, opacity: 0.75, marginBottom: 16 }}>
                Uber Eats has different info for “{product.name}”. Nothing changes until you choose.
              </p>

              <div style={{ display: "grid", gap: 12 }}>
                {pending.name !== undefined && <DiffRow label="Name" from={product.name} to={pending.name} />}
                {"description" in pending && (
                  <DiffRow label="Description" from={product.description ?? "—"} to={pending.description ?? "—"} />
                )}
                {pending.price !== undefined && (
                  <DiffRow label="Price" from={`$${product.price.toFixed(2)}`} to={`$${pending.price.toFixed(2)}`} />
                )}
                {"imageUrl" in pending && (
                  <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <ImagePreview label="Current" url={product.image?.url ?? null} />
                    <ImagePreview label="Proposed" url={pending.imageUrl ?? null} />
                  </div>
                )}
              </div>

              <div className="grid" style={{ gap: 8, marginTop: 20 }}>
                <button type="button" className="btn btn--red btn--sm" disabled={!!busy} onClick={() => apply("apply_all")}>
                  {busy === "apply_all" ? "Applying…" : "Update everything"}
                </button>
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 8 }}>
                  {pending.name !== undefined && (
                    <button type="button" className="btn btn--white btn--sm" disabled={!!busy} onClick={() => apply("apply_name")}>
                      Update name
                    </button>
                  )}
                  {"description" in pending && (
                    <button type="button" className="btn btn--white btn--sm" disabled={!!busy} onClick={() => apply("apply_description")}>
                      Update description
                    </button>
                  )}
                  {pending.price !== undefined && (
                    <button type="button" className="btn btn--white btn--sm" disabled={!!busy} onClick={() => apply("apply_price")}>
                      Update price
                    </button>
                  )}
                  {"imageUrl" in pending && (
                    <button type="button" className="btn btn--white btn--sm" disabled={!!busy} onClick={() => apply("apply_image")}>
                      Update image
                    </button>
                  )}
                </div>
                <button type="button" className="btn btn--white btn--sm" disabled={!!busy} onClick={() => apply("ignore")}>
                  Ignore — keep my current version
                </button>
              </div>
            </Dialog.Content>
          )}
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DiffRow({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div>
      <p className="mono" style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.55, marginBottom: 4 }}>
        {label}
      </p>
      <div className="flex center" style={{ gap: 8, flexWrap: "wrap" }}>
        <span style={{ textDecoration: "line-through", opacity: 0.55 }}>{from}</span>
        <span>→</span>
        <span style={{ fontWeight: 700 }}>{to}</span>
      </div>
    </div>
  );
}

function ImagePreview({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <p className="mono" style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.55, marginBottom: 4 }}>
        {label}
      </p>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: "var(--r-sm)", border: "var(--border)" }} />
      ) : (
        <div className="ph" style={{ aspectRatio: "4/3" }} />
      )}
    </div>
  );
}
