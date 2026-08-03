"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Switch } from "@realm/ui/switch";
import { apiFetch } from "@/lib/http/api-fetch";
import type { CategoryListRow } from "@/lib/services/inventory.service";

type PushResult = {
  created: string[];
  updated: string[];
  errors: Array<{ publicId: string; message: string }>;
} | null;

export function CategoryEditDialog({
  category,
  onOpenChange,
}: {
  category: CategoryListRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [colorCode, setColorCode] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!category) return;
    setName(category.name);
    setSortOrder(String(category.sortOrder));
    setColorCode(category.colorCode ?? "");
    setActive(category.active);
  }, [category]);

  async function save() {
    if (!category) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ pushed: PushResult }>(
        `/api/inventory/categories/${category.publicId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name,
            sortOrder: Number(sortOrder),
            colorCode: colorCode.trim() === "" ? null : colorCode.trim(),
            active,
          }),
        },
      );
      // Saved locally either way; a failed push means the POS disagrees, which
      // the admin needs to hear rather than see a plain "Saved".
      const pushError = res.pushed?.errors?.[0]?.message;
      if (pushError) toast.warning(`Saved, but Clover rejected the push: ${pushError}`);
      else if (res.pushed) toast.success("Saved and pushed to Clover");
      else toast.success("Saved. Connect Clover to push this change to the POS.");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save category");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={!!category}
      onOpenChange={onOpenChange}
      title="Edit category"
      description="Saved here and pushed to Clover, which owns the catalogue."
      contentClassName="sm:max-w-lg"
    >
      <div className="grid gap-4 px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="cat-name">Name</Label>
          <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cat-order">Display order</Label>
            <Input
              id="cat-order"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-color">Colour</Label>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-6 shrink-0 rounded border"
                style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(colorCode) ? colorCode : undefined }}
              />
              <Input
                id="cat-color"
                value={colorCode}
                placeholder="#FF0080"
                onChange={(e) => setColorCode(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Active</p>
            <p className="text-muted-foreground text-xs">
              Inactive categories stay in Clover; this only hides them here.
            </p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={busy || !name.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
