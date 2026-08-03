"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { apiFetch } from "@/lib/http/api-fetch";

const PHRASE = "DELETE ALL PRODUCTS";

type DeleteAllResult = {
  products: number;
  orderLines: number;
  imagesDeleted: number;
  imageErrors: number;
};

/**
 * TEMPORARY — one-time catalogue wipe before rebuilding from Clover.
 * Delete this file, its button in products-header-actions.tsx, the
 * app/api/products/delete-all route, and ProductsService.deleteAllProducts
 * to remove the feature.
 *
 * Typed confirmation rather than a yes/no: this also deletes order line items,
 * and a two-click destructive action on an admin page is too easy to hit.
 */
export function DeleteAllProductsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  const armed = phrase.trim() === PHRASE;

  async function run() {
    if (!armed) return;
    setBusy(true);
    try {
      const result = await apiFetch<DeleteAllResult>("/api/products/delete-all", {
        method: "POST",
        body: JSON.stringify({ confirm: PHRASE }),
      });
      toast.success(
        `Deleted ${result.products} product(s), ${result.orderLines} order line(s), ` +
          `${result.imagesDeleted} image(s)` +
          (result.imageErrors ? ` — ${result.imageErrors} image(s) could not be removed` : ""),
      );
      setPhrase("");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete products");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPhrase("");
        onOpenChange(next);
      }}
      title="Delete every product"
      description="Clears the catalogue so a Clover pull can rebuild it from the POS."
      contentClassName="sm:max-w-lg"
    >
      <div className="grid gap-4 px-4 py-4">
        <div className="border-destructive/40 bg-destructive/5 flex gap-3 rounded-lg border p-3">
          <AlertTriangleIcon className="text-destructive mt-0.5 size-4 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">This cannot be undone.</p>
            <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-4">
              <li>Every product is removed, including ones linked to Clover.</li>
              <li>Their photos are deleted from storage.</li>
              <li>
                Order line items are deleted too. Past orders keep their totals but lose the
                list of what was bought.
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="delete-all-confirm">
            Type <span className="font-mono">{PHRASE}</span> to continue
          </Label>
          <Input
            id="delete-all-confirm"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={PHRASE}
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!armed || busy}
            onClick={run}
          >
            {busy ? "Deleting…" : "Delete everything"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
