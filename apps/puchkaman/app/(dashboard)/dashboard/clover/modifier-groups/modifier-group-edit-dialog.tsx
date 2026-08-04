"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Switch } from "@realm/ui/switch";
import { apiFetch } from "@/lib/http/api-fetch";
import type { ModifierGroupListRow } from "@/lib/services/inventory.service";

type PushResult = {
  created: string[];
  updated: string[];
  errors: Array<{ publicId: string; message: string }>;
} | null;

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

export function ModifierGroupEditDialog({
  group,
  onOpenChange,
}: {
  group: ModifierGroupListRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  // Seeded straight from the row; the caller remounts on a new group via `key`,
  // so there is no prop-to-state sync effect to keep in step.
  const [name, setName] = useState(group?.name ?? "");
  const [alternateName, setAlternateName] = useState(group?.alternateName ?? "");
  const [minRequired, setMinRequired] = useState(
    group?.minRequired == null ? "" : String(group.minRequired),
  );
  const [maxAllowed, setMaxAllowed] = useState(
    group?.maxAllowed == null ? "" : String(group.maxAllowed),
  );
  const [showByDefault, setShowByDefault] = useState(group?.showByDefault ?? true);
  const [sortOrder, setSortOrder] = useState(String(group?.sortOrder ?? 0));
  const [active, setActive] = useState(group?.active ?? true);
  const [busy, setBusy] = useState(false);

  const min = numOrNull(minRequired);
  const max = numOrNull(maxAllowed);
  const rangeInvalid = min != null && max != null && max < min;

  async function save() {
    if (!group || rangeInvalid) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ pushed: PushResult }>(
        `/api/inventory/modifier-groups/${group.publicId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name,
            alternateName: alternateName.trim() === "" ? null : alternateName.trim(),
            minRequired: min,
            maxAllowed: max,
            showByDefault,
            sortOrder: Number(sortOrder),
            active,
          }),
        },
      );
      const pushError = res.pushed?.errors?.[0]?.message;
      if (pushError) toast.warning(`Saved, but Clover rejected the push: ${pushError}`);
      else if (res.pushed) toast.success("Saved and pushed to Clover");
      else toast.success("Saved. Connect Clover to push this change to the POS.");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save modifier group");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={!!group}
      onOpenChange={onOpenChange}
      title="Edit modifier group"
      description="Saved here and pushed to Clover, which owns the catalogue."
      contentClassName="sm:max-w-lg"
    >
      <div className="grid gap-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mg-name">Name</Label>
            <Input id="mg-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mg-alt">Alternate name</Label>
            <Input
              id="mg-alt"
              value={alternateName}
              placeholder="Optional"
              onChange={(e) => setAlternateName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mg-min">Min required</Label>
            <Input
              id="mg-min"
              type="number"
              min={0}
              value={minRequired}
              placeholder="No minimum"
              onChange={(e) => setMinRequired(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mg-max">Max allowed</Label>
            <Input
              id="mg-max"
              type="number"
              min={0}
              value={maxAllowed}
              placeholder="No maximum"
              onChange={(e) => setMaxAllowed(e.target.value)}
            />
            {rangeInvalid ? (
              <p role="alert" className="text-destructive text-xs">
                Max allowed cannot be lower than min required.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mg-order">Display order</Label>
            <Input
              id="mg-order"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Show by default</p>
            <p className="text-muted-foreground text-xs">
              Whether Register opens this group automatically on an item.
            </p>
          </div>
          <Switch checked={showByDefault} onCheckedChange={setShowByDefault} />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Active</p>
            <p className="text-muted-foreground text-xs">
              Inactive groups stay in Clover; this only hides them here.
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
          <Button
            type="button"
            size="sm"
            disabled={busy || !name.trim() || rangeInvalid}
            onClick={save}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
