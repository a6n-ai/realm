"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import type { DeliveryType } from "@/lib/delivery/zones";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@realm/ui/card";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Switch } from "@realm/ui/switch";
import { Textarea } from "@realm/ui/textarea";
import { retireDeliveryTypeAction, saveDeliveryTypeAction, type TypeFormValues } from "./actions";

// Plain JSON in — publicId is always present here (rows came from a DB query).
export type TypeRow = Required<Pick<DeliveryType, "publicId">> &
  Omit<DeliveryType, "id" | "publicId">;

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

function TypeForm({
  initial,
  isNew,
  onSaved,
}: {
  initial: TypeFormValues;
  isNew: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initial);
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
      onSaved();
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
      onSaved();
    });
  }

  const busy = pending || retiring;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{isNew ? "Add delivery type" : form.label || form.key}</span>
          {!isNew && !form.active ? <Badge variant="secondary">Retired</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`key-${form.publicId ?? "new"}`}>Key</Label>
            {/* Immutable after creation — orders and fulfillment reference it. */}
            <Input
              id={`key-${form.publicId ?? "new"}`}
              value={form.key}
              onChange={(e) => set("key", e.target.value)}
              disabled={!isNew}
              placeholder="instant"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`label-${form.publicId ?? "new"}`}>Label</Label>
            <Input
              id={`label-${form.publicId ?? "new"}`}
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="Instant delivery"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`desc-${form.publicId ?? "new"}`}>Description</Label>
          <Textarea
            id={`desc-${form.publicId ?? "new"}`}
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`min-${form.publicId ?? "new"}`}>Minimum subtotal ($)</Label>
            <Input
              id={`min-${form.publicId ?? "new"}`}
              type="number"
              min={0}
              step={0.5}
              value={form.minSubtotal}
              onChange={(e) => set("minSubtotal", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`disc-${form.publicId ?? "new"}`}>Discount (%)</Label>
            <Input
              id={`disc-${form.publicId ?? "new"}`}
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.discountPct}
              onChange={(e) => set("discountPct", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`sort-${form.publicId ?? "new"}`}>Sort order</Label>
            <Input
              id={`sort-${form.publicId ?? "new"}`}
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
      </CardContent>
    </Card>
  );
}

export function TypeEditor({ types }: { types: TypeRow[] }) {
  const router = useRouter();
  const [addingNew, setAddingNew] = useState(false);
  const [newKey, setNewKey] = useState(0);

  function refresh() {
    setAddingNew(false);
    setNewKey((k) => k + 1);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setAddingNew(true)} disabled={addingNew}>
          <PlusIcon />
          Add type
        </Button>
      </div>

      {addingNew ? (
        <TypeForm key={`new-${newKey}`} initial={blankForm()} isNew onSaved={refresh} />
      ) : null}

      {types.length === 0 && !addingNew ? (
        <p className="text-muted-foreground text-sm">No delivery types yet.</p>
      ) : (
        types.map((t) => (
          <TypeForm key={t.publicId} initial={rowToForm(t)} isNew={false} onSaved={refresh} />
        ))
      )}
    </div>
  );
}
