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
import type { DiscountDto } from "@/app/(dashboard)/dashboard/catalog/discounts/build-rows";
import type { WaiverKind } from "@/lib/catalog/types";

export const WAIVER_LABELS: Record<WaiverKind, string> = {
  waiver_delivery: "All delivery fees",
  waiver_base: "Base delivery charge",
  waiver_strategy: "One strategy fee",
  waiver_tax: "Tax (we pay it)",
};

export interface WaiverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  waiver?: DiscountDto | null;
  strategies: { publicId: string; name: string }[];
}

export function WaiverDialog(props: WaiverDialogProps) {
  return props.open ? <Body key={props.waiver?.publicId ?? "__new__"} {...props} /> : null;
}

function Body({ onOpenChange, waiver, strategies }: WaiverDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(waiver?.name ?? "");
  const [kind, setKind] = useState<WaiverKind>((waiver?.kind as WaiverKind | undefined) ?? "waiver_delivery");
  const [target, setTarget] = useState(waiver?.targetPublicId ?? "");
  const [percent, setPercent] = useState(waiver ? String(waiver.percent) : "100");
  const [startsAt, setStartsAt] = useState(waiver?.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(waiver?.endsAt ?? "");
  const [active, setActive] = useState(waiver?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "waiver_strategy" && !target) {
      setErrors({ targetId: "Pick a strategy" });
      return;
    }
    const strategyName = strategies.find((s) => s.publicId === target)?.name;
    const autoName = kind === "waiver_strategy" ? `${strategyName ?? "Strategy"} fee waived` : `${WAIVER_LABELS[kind]} waived`;
    const values = {
      name: name.trim() || autoName,
      kind,
      targetId: kind === "waiver_strategy" ? target : null,
      percent, amount: null, minWeeks: "", startsAt, endsAt, active,
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
      await saveItem("discounts", waiver?.publicId ?? null, values);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setErrors({ root: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => (errors[k] ? <p className="text-destructive text-xs" role="alert">{errors[k]}</p> : null);

  return (
    <ResponsiveDialog
      open
      onOpenChange={onOpenChange}
      title={waiver ? "Edit waiver" : "Add waiver"}
      description="Waive a fee, or cover the tax. Waivers sit outside the discount cap."
      contentClassName="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="min-h-11 sm:min-h-9">Cancel</Button>
          <Button type="submit" form="waiver-dialog-form" disabled={busy} className="min-h-11 sm:min-h-9">
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <form id="waiver-dialog-form" noValidate onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="wd-name">Name <span className="text-muted-foreground font-normal">shown to customers</span></Label>
          <Input id="wd-name" placeholder="e.g. Launch offer: free delivery" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          {err("name")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wd-kind">Waive</Label>
          <Select value={kind} disabled={Boolean(waiver)} onValueChange={(v) => { setKind(v as WaiverKind); setTarget(""); }}>
            <SelectTrigger id="wd-kind" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(WAIVER_LABELS) as WaiverKind[]).map((k) => <SelectItem key={k} value={k}>{WAIVER_LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          {err("kind")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wd-percent">Waive %</Label>
          <Input id="wd-percent" type="number" inputMode="decimal" min={1} max={100} step="any" value={percent} onChange={(e) => setPercent(e.target.value)} />
          {err("percent")}
        </div>
        {kind === "waiver_strategy" ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="wd-target">Strategy</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="wd-target" className="w-full"><SelectValue placeholder="Pick a strategy" /></SelectTrigger>
              <SelectContent>
                {strategies.map((s) => <SelectItem key={s.publicId} value={s.publicId}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {err("targetId")}
          </div>
        ) : null}
        {kind === "waiver_tax" ? (
          <p className="text-muted-foreground text-xs sm:col-span-2">
            Tax can&apos;t be dropped from a sale, so the price is lowered until price plus tax equals the pre-tax amount. The receipt still shows the tax.
          </p>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="wd-start">Start date (optional)</Label>
          <Input id="wd-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          {err("startsAt")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wd-end">End date (optional)</Label>
          <Input id="wd-end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          {err("endsAt")}
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Switch id="wd-active" checked={active} onCheckedChange={setActive} />
          <Label htmlFor="wd-active">Active</Label>
        </div>
        {errors.root ? <p className="text-destructive text-sm sm:col-span-2" role="alert">{errors.root}</p> : null}
      </form>
    </ResponsiveDialog>
  );
}
