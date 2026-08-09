"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Switch } from "@realm/ui/switch";
import { Textarea } from "@realm/ui/textarea";
import { retireDeliveryTypeAction, saveDeliveryTypeAction, type TypeFormValues } from "./actions";
import type { TypeRow } from "./types-table";

function blankForm(): TypeFormValues {
  return {
    publicId: null,
    key: "",
    label: "",
    description: "",
    requiresAddress: true,
    requiresSchedule: false,
    minSubtotal: 0,
    discountPct: 0,
    sortOrder: 0,
    active: true,
  };
}

function rowToForm(row: TypeRow): TypeFormValues {
  return {
    publicId: row.publicId,
    key: row.key,
    label: row.label,
    description: row.description ?? "",
    requiresAddress: row.requiresAddress,
    requiresSchedule: row.requiresSchedule,
    minSubtotal: row.minSubtotal,
    discountPct: row.discountPct,
    sortOrder: row.sortOrder,
    active: row.active,
  };
}

export function TypeEditDialog({
  type,
  onOpenChange,
}: {
  type: TypeRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isNew = type === null;
  // Seeded straight from the row; the caller remounts on a new type via `key`,
  // so there is no prop-to-state sync effect to keep in step.
  const [form, setForm] = useState<TypeFormValues>(type ? rowToForm(type) : blankForm());
  const [pending, start] = useTransition();
  const [retiring, startRetire] = useTransition();

  function set<K extends keyof TypeFormValues>(key: K, value: TypeFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    start(async () => {
      const res = await saveDeliveryTypeAction(form);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(isNew ? "Delivery type created" : "Delivery type saved");
      onOpenChange(false);
      router.refresh();
    });
  }

  function retire() {
    if (!form.publicId) return;
    startRetire(async () => {
      const res = await retireDeliveryTypeAction(form.publicId!);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Delivery type retired");
      onOpenChange(false);
      router.refresh();
    });
  }

  const busy = pending || retiring;

  return (
    // Table only mounts this dialog when it should be open, so `open` is always true here;
    // onOpenChange(false) still tells the table to unmount on cancel/save/escape.
    <ResponsiveDialog
      open
      onOpenChange={onOpenChange}
      title={isNew ? "Add delivery type" : form.label || form.key}
      description="What a customer can pick at checkout, and the rules this option carries."
      contentClassName="sm:max-w-lg"
    >
      <div className="grid gap-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="type-key">Key</Label>
            {/* Immutable after creation — orders and fulfillment reference it. */}
            <Input
              id="type-key"
              value={form.key}
              onChange={(e) => set("key", e.target.value)}
              disabled={!isNew}
              placeholder="instant"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type-label">Label</Label>
            <Input
              id="type-label"
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="Instant delivery"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="type-desc">Description</Label>
          <Textarea
            id="type-desc"
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="type-min">Minimum subtotal ($)</Label>
            <Input
              id="type-min"
              type="number"
              min={0}
              step={0.5}
              value={form.minSubtotal}
              onChange={(e) => set("minSubtotal", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type-disc">Discount (%)</Label>
            <Input
              id="type-disc"
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.discountPct}
              onChange={(e) => set("discountPct", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type-sort">Sort order</Label>
            <Input
              id="type-sort"
              type="number"
              step={1}
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <span className="text-sm font-medium">Requires address</span>
            <Switch
              checked={form.requiresAddress}
              onCheckedChange={(v) => set("requiresAddress", v)}
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <span className="text-sm font-medium">Requires schedule</span>
            <Switch
              checked={form.requiresSchedule}
              onCheckedChange={(v) => set("requiresSchedule", v)}
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <span className="text-sm font-medium">Active</span>
            <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
          </label>
        </div>

        <div className="flex items-center justify-between gap-2">
          {!isNew ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !form.active}
              onClick={retire}
            >
              {form.active ? "Retire" : "Retired"}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" size="sm" disabled={busy} onClick={save}>
            {pending ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
