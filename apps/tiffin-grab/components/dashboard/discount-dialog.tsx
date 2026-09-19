"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import { ResponsiveDialog } from "@/components/ds";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { saveItem } from "@/app/(dashboard)/dashboard/catalog/actions";
import type { DiscountDto, DiscountKind } from "@/app/(dashboard)/dashboard/catalog/discounts/build-rows";

export interface DiscountDialogOptions {
  frequencies: { publicId: string; name: string }[];
  durations: { publicId: string; weeks: number }[];
}

export interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discount?: DiscountDto | null;
  prefill?: { kind: DiscountKind; targetPublicId?: string | null; lockTarget?: boolean };
  options: DiscountDialogOptions;
  onSaved?: () => void;
}

const KIND_LABELS: Record<DiscountKind, string> = { delivery: "Delivery type", duration: "Plan length" };

function targetLabel(kind: DiscountKind, id: string | null, o: DiscountDialogOptions) {
  if (id == null) return kind === "delivery" ? "all delivery types" : "all plan lengths";
  return kind === "delivery"
    ? (o.frequencies.find((f) => f.publicId === id)?.name ?? "")
    : `${o.durations.find((d) => d.publicId === id)?.weeks ?? ""} weeks`;
}

export function DiscountDialog(props: DiscountDialogProps) {
  // Remount per open so the form always starts from the current discount/prefill.
  return props.open ? <Body key={props.discount?.publicId ?? "__new__"} {...props} /> : null;
}

function Body({ onOpenChange, discount, prefill, options, onSaved }: DiscountDialogProps) {
  const router = useRouter();
  const editing = Boolean(discount);
  const locked = !editing && Boolean(prefill?.lockTarget);
  const [kind, setKind] = useState<DiscountKind>(discount?.kind ?? prefill?.kind ?? "delivery");
  const [target, setTarget] = useState<string>(discount ? (discount.targetPublicId ?? "all") : (prefill?.targetPublicId ?? "all"));
  const [percent, setPercent] = useState(discount ? String(discount.percent) : "");
  const [minWeeks, setMinWeeks] = useState(discount?.minWeeks != null ? String(discount.minWeeks) : "");
  const [startsAt, setStartsAt] = useState(discount?.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(discount?.endsAt ?? "");
  const [active, setActive] = useState(discount?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const targets = kind === "delivery"
    ? options.frequencies.map((f) => ({ value: f.publicId, label: f.name }))
    : options.durations.map((d) => ({ value: d.publicId, label: `${d.weeks} weeks` }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const targetId = target === "all" ? null : target;
    const values = {
      name: discount?.name ?? `${percent}% off ${targetLabel(kind, targetId, options)}`,
      kind, targetId, percent, minWeeks, startsAt, endsAt, active,
    };
    const parsed = RESOURCES.discounts.schema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0] ?? "root")] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await saveItem("discounts", discount?.publicId ?? null, values);
      onOpenChange(false);
      onSaved?.();
      router.refresh();
    } catch (err) {
      setErrors({ root: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => errors[k] ? <p className="text-destructive text-xs" role="alert">{errors[k]}</p> : null;

  return (
    <ResponsiveDialog
      open
      onOpenChange={onOpenChange}
      title={editing ? "Edit discount" : "Add discount"}
      description="Applicable discounts add up, capped by the discount cap."
      contentClassName="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="min-h-11 sm:min-h-9">Cancel</Button>
          <Button type="submit" form="discount-dialog-form" disabled={busy} className="min-h-11 sm:min-h-9">
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <form id="discount-dialog-form" noValidate onSubmit={submit} className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="dd-kind">Applies to</Label>
          <Select value={kind} disabled={locked} onValueChange={(v) => { setKind(v as DiscountKind); setTarget("all"); }}>
            <SelectTrigger id="dd-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABELS) as DiscountKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          {err("kind")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dd-target">Target</Label>
          <Select value={target} disabled={locked} onValueChange={setTarget}>
            <SelectTrigger id="dd-target"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{kind === "delivery" ? "All delivery types" : "All plan lengths"}</SelectItem>
              {targets.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {err("targetId")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dd-percent">Discount %</Label>
          <Input id="dd-percent" type="number" inputMode="decimal" min={0} max={100} step="any" value={percent} onChange={(e) => setPercent(e.target.value)} />
          {err("percent")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dd-min">Min weeks (optional)</Label>
          <Input id="dd-min" type="number" inputMode="numeric" min={1} value={minWeeks} onChange={(e) => setMinWeeks(e.target.value)} />
          {err("minWeeks")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dd-start">Start date (optional)</Label>
          <Input id="dd-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          {err("startsAt")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dd-end">End date (optional)</Label>
          <Input id="dd-end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          {err("endsAt")}
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Switch id="dd-active" checked={active} onCheckedChange={setActive} />
          <Label htmlFor="dd-active">Active</Label>
        </div>
        {errors.root ? <p className="text-destructive text-sm sm:col-span-2" role="alert">{errors.root}</p> : null}
      </form>
    </ResponsiveDialog>
  );
}
