"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import type { DuplicateCandidate } from "@/lib/sync/menu-sync.service";
import { apiFetch } from "@/lib/http/api-fetch";

export function DuplicateDialog({
  queue,
  onDone,
}: {
  queue: DuplicateCandidate[];
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
        body: JSON.stringify({ existingPublicId: current.existingPublicId, action, incoming: current.incoming }),
      });
      if (index + 1 < queue.length) setIndex((i) => i + 1);
      else onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onDone()}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(22,20,13,.6)", zIndex: 80, display: "grid", placeItems: "center", padding: 20 }}>
          <Dialog.Content className="card" style={{ width: "100%", maxWidth: 560, background: "var(--white)", padding: "clamp(20px,3vw,30px)" }}>
            <Dialog.Title className="display" style={{ fontSize: "1.2rem", marginBottom: 4 }}>
              A similar product already exists
            </Dialog.Title>
            <Dialog.Description style={{ fontWeight: 500, opacity: 0.75, marginBottom: 4 }}>
              {index + 1} of {queue.length} — “{current.incoming.name}” looks like it might already be on your menu.
            </Dialog.Description>

            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14, margin: "18px 0" }}>
              <ProductPreview
                label="Current website product"
                name={current.existingName}
                price={current.existingPrice}
                imageUrl={current.existingImageUrl}
                extra={current.existingActive ? "Active" : "Archived"}
              />
              <ProductPreview label="Uber Eats product" name={current.incoming.name} price={current.incoming.price} imageUrl={current.incoming.imageUrl} />
            </div>

            <div className="grid" style={{ gap: 8 }}>
              <button type="button" className="btn btn--red btn--sm" disabled={busy} onClick={() => resolve("replace")}>
                Replace existing with Uber Eats version
              </button>
              <button type="button" className="btn btn--yellow btn--sm" disabled={busy} onClick={() => resolve("keep")}>
                Keep existing, just link it to Uber Eats
              </button>
              <button type="button" className="btn btn--white btn--sm" disabled={busy} onClick={() => resolve("skip")}>
                Skip — treat as unrelated
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
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
    <div className="card" style={{ padding: 12, background: "var(--paper)" }}>
      <p className="mono" style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.55, marginBottom: 8 }}>
        {label}
      </p>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: "var(--r-sm)", border: "var(--border)" }} />
      ) : (
        <div className="ph" style={{ aspectRatio: "4/3" }} />
      )}
      <p style={{ fontWeight: 700, marginTop: 8 }}>{name}</p>
      <p className="mono" style={{ fontWeight: 700, color: "var(--red)" }}>
        ${price.toFixed(2)}
      </p>
      {extra && <p style={{ fontSize: "0.78rem", opacity: 0.65 }}>{extra}</p>}
    </div>
  );
}
