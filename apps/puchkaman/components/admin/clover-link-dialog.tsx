"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, LinkIcon, UnlinkIcon } from "lucide-react";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { Switch } from "@realm/ui/switch";
import { Label } from "@realm/ui/label";
import { apiFetch } from "@/lib/http/api-fetch";
import type { CloverUnlinkedItem } from "@/lib/sync/clover-inventory-sync.service";

/**
 * Manual Link / Unlink between a local product and a Clover inventory item.
 * Preserves Uber Eats externalId; optionally adopts Clover inventory fields.
 */
export function CloverLinkDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    publicId: string;
    name: string;
    cloverItemId: string | null;
  } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<CloverUnlinkedItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adoptInventory, setAdoptInventory] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const linked = Boolean(product?.cloverItemId);

  useEffect(() => {
    if (!open || !product || linked) {
      setItems(null);
      setSelected(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    void (async () => {
      try {
        const res = await apiFetch<{ items: CloverUnlinkedItem[] }>(
          "/api/products/sync/clover/unlinked",
        );
        if (cancelled) return;
        setItems(res.items);
        setSelected(res.items[0]?.cloverItemId ?? null);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load Clover items");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, product, linked]);

  async function unlink() {
    if (!product) return;
    setBusy(true);
    try {
      await apiFetch(`/api/products/${product.publicId}/clover-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "unlink" }),
      });
      router.refresh();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  async function link() {
    if (!product || !selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/products/${product.publicId}/clover-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "link",
          cloverItemId: selected,
          adoptInventory,
        }),
      });
      router.refresh();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  if (!product) return null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={linked ? "Unlink from Clover" : "Link to Clover item"}
      description={
        linked
          ? `“${product.name}” is linked to Clover ${product.cloverItemId}. Unlinking keeps local fields and Uber image linkage.`
          : `Attach “${product.name}” to a Clover inventory item. Clover is inventory source of truth when you adopt fields.`
      }
      contentClassName="sm:max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {linked ? (
            <Button
              type="button"
              variant="destructive"
              className="gap-1.5"
              disabled={busy}
              onClick={() => void unlink()}
            >
              {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <UnlinkIcon className="size-3.5" />}
              Unlink
            </Button>
          ) : (
            <Button
              type="button"
              className="gap-1.5"
              disabled={busy || !selected}
              onClick={() => void link()}
            >
              {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <LinkIcon className="size-3.5" />}
              Link
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-4 px-4 py-4">
        {linked ? (
          <p className="text-muted-foreground text-sm font-mono">{product.cloverItemId}</p>
        ) : (
          <>
            {loadError ? <p className="text-destructive text-sm">{loadError}</p> : null}
            {!items && !loadError ? (
              <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                <Loader2Icon className="size-4 animate-spin" />
                Loading unlinked Clover items…
              </div>
            ) : null}
            {items && items.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No unlinked Clover items. Pull from Clover first, or push this product to create one.
              </p>
            ) : null}
            {items && items.length > 0 ? (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {items.map((item) => (
                  <label
                    key={item.cloverItemId}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                      selected === item.cloverItemId ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="clover-item"
                      className="mt-1"
                      checked={selected === item.cloverItemId}
                      onChange={() => setSelected(item.cloverItemId)}
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        ${item.price.toFixed(2)}
                        {item.category ? ` · ${item.category}` : ""}
                        {item.sku ? ` · SKU ${item.sku}` : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="adopt-clover" className="font-medium">
                  Adopt Clover inventory
                </Label>
                <p className="text-muted-foreground text-xs">
                  Overwrite local name, price, category, and availability from Clover
                </p>
              </div>
              <Switch
                id="adopt-clover"
                checked={adoptInventory}
                onCheckedChange={setAdoptInventory}
              />
            </div>
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
