"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import type { CouponConfig, CouponKind } from "@/db/schema/coupons";
import { SectionCard } from "@/components/ds";
import { Button } from "@realm/ui/button";
import { Badge } from "@realm/ui/badge";
import { Skeleton } from "@realm/ui/skeleton";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@realm/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@realm/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@realm/ui/dialog";
import { cn } from "@realm/ui/cn";
import {
  BUSINESS_TZ_LABEL,
  CREATABLE_KINDS,
  KIND_LABELS,
  Multiselect,
  NumberField,
  PLAN_TYPES,
  ToggleRow,
  formatWindow,
  fromLocalInput,
  money,
  numOrNull,
  pct,
  toLocalInput,
} from "../controls";
import { saveCoupon, setCouponActive } from "../actions";

type CouponRow = {
  publicId: string;
  code: string;
  kind: CouponKind;
  name: string;
  description: string | null;
  valuePct: string | null;
  valueAmount: string | null;
  minSubtotal: string | null;
  maxRedemptions: number | null;
  maxPerUser: number | null;
  redemptionCount: number;
  stackable: boolean;
  autoApply: boolean;
  planTypes: string[];
  startsAt: number | null;
  expiresAt: number | null;
  active: boolean;
  config: CouponConfig | null;
};

type Draft = {
  publicId: string | null;
  code: string;
  kind: CouponKind;
  name: string;
  description: string;
  valuePct: string;
  valueAmount: string;
  mode: "percentage" | "fixed";
  minSubtotal: string;
  maxRedemptions: string;
  maxPerUser: string;
  planTypes: string[];
  startsAt: string;
  expiresAt: string;
  stackable: boolean;
  autoApply: boolean;
  active: boolean;
};

function emptyDraft(): Draft {
  return {
    publicId: null,
    code: "",
    kind: "percentage",
    name: "",
    description: "",
    valuePct: "",
    valueAmount: "",
    mode: "fixed",
    minSubtotal: "",
    maxRedemptions: "",
    maxPerUser: "",
    planTypes: [],
    startsAt: "",
    expiresAt: "",
    stackable: false,
    autoApply: false,
    active: true,
  };
}

function toDraft(c: CouponRow): Draft {
  return {
    publicId: c.publicId,
    code: c.code,
    kind: c.kind,
    name: c.name,
    description: c.description ?? "",
    valuePct: c.valuePct == null ? "" : String(Number(c.valuePct)),
    valueAmount: c.valueAmount == null ? "" : String(Number(c.valueAmount)),
    mode: c.config?.kind === "first_order" ? c.config.mode : "fixed",
    minSubtotal: c.minSubtotal == null ? "" : String(Number(c.minSubtotal)),
    maxRedemptions: c.maxRedemptions == null ? "" : String(c.maxRedemptions),
    maxPerUser: c.maxPerUser == null ? "" : String(c.maxPerUser),
    planTypes: c.planTypes,
    startsAt: toLocalInput(c.startsAt),
    expiresAt: toLocalInput(c.expiresAt),
    stackable: c.stackable,
    autoApply: c.autoApply,
    active: c.active,
  };
}

function couponValue(c: CouponRow): string {
  switch (c.kind) {
    case "percentage":
      return pct(c.valuePct);
    case "fixed":
      return money(c.valueAmount);
    case "first_order":
      return c.config?.kind === "first_order" && c.config.mode === "percentage"
        ? pct(c.valuePct)
        : money(c.valueAmount);
    case "free_delivery":
      return "Free delivery";
    case "rep_daily":
      return "Capped";
  }
}

function YesNo({ value }: { value: boolean }) {
  return value ? <Badge variant="outline">Yes</Badge> : <span className="text-muted-foreground">No</span>;
}

// Single source of truth for the table's columns. The real header and the
// .Skeleton twin both render from this, so the loading skeleton can never
// drift from the component.
const COLUMNS = [
  { key: "code", label: "Code" },
  { key: "kind", label: "Kind" },
  { key: "value", label: "Value", align: "right" },
  { key: "autoApply", label: "Auto-apply" },
  { key: "window", label: "Window" },
  { key: "stackable", label: "Stackable" },
  { key: "status", label: "Status" },
  { key: "actions", label: "", width: "w-px" },
] as const;

export function CouponsManager({ coupons }: { coupons: CouponRow[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [draft, setDraft] = React.useState<Draft | null>(null);

  const open = (d: Draft) => setDraft(d);

  const submit = () => {
    if (!draft) return;
    if (!draft.code.trim() || !draft.name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    const patch = {
      code: draft.code.trim(),
      kind: draft.kind,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      valuePct: numOrNull(draft.valuePct),
      valueAmount: numOrNull(draft.valueAmount),
      mode: draft.mode,
      minSubtotal: numOrNull(draft.minSubtotal),
      maxRedemptions: numOrNull(draft.maxRedemptions),
      maxPerUser: numOrNull(draft.maxPerUser),
      stackable: draft.stackable,
      autoApply: draft.autoApply,
      planTypes: draft.planTypes,
      startsAt: fromLocalInput(draft.startsAt),
      expiresAt: fromLocalInput(draft.expiresAt),
      active: draft.active,
    };
    start(async () => {
      try {
        await saveCoupon(draft.publicId, patch);
        toast.success(draft.publicId ? "Coupon updated" : "Coupon created");
        setDraft(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save coupon");
      }
    });
  };

  const toggleActive = (c: CouponRow) => {
    start(async () => {
      try {
        await setCouponActive(c.publicId, !c.active);
        toast.success(c.active ? "Coupon disabled" : "Coupon enabled");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update coupon");
      }
    });
  };

  return (
    <SectionCard
      title="Coupons"
      subtitle="Codes customers enter at checkout. Rep daily coupons are minted automatically and not shown here."
      action={
        <Button size="sm" onClick={() => open(emptyDraft())} className="transition-transform active:scale-[0.96]">
          <PlusIcon className="size-4" />
          New coupon
        </Button>
      }
    >
      {coupons.length === 0 ? (
        <p className="text-muted-foreground text-sm">No coupons yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className={cn("align" in c && "text-right", "width" in c && c.width)}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((c) => (
              <TableRow key={c.publicId} className={cn(!c.active && "opacity-60")}>
                <TableCell>
                  <div className="grid gap-0.5">
                    <span className="font-mono text-sm font-medium">{c.code}</span>
                    <span className="text-muted-foreground text-xs">{c.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{KIND_LABELS[c.kind]}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{couponValue(c)}</TableCell>
                <TableCell>
                  <YesNo value={c.autoApply} />
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap text-sm">
                  {formatWindow(c.startsAt, c.expiresAt)}
                </TableCell>
                <TableCell>
                  <YesNo value={c.stackable} />
                </TableCell>
                <TableCell>
                  {c.active ? (
                    <Badge variant="outline">Active</Badge>
                  ) : (
                    <Badge variant="destructive">Disabled</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => open(toDraft(c))}
                      className="transition-transform active:scale-[0.96]"
                    >
                      <PencilIcon className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => toggleActive(c)}
                      className="text-muted-foreground transition-[color,transform] active:scale-[0.96]"
                    >
                      {c.active ? <XIcon className="size-3.5" /> : <RotateCcwIcon className="size-3.5" />}
                      {c.active ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {draft && (
            <>
              <DialogHeader>
                <DialogTitle>{draft.publicId ? "Edit coupon" : "New coupon"}</DialogTitle>
                <DialogDescription>
                  Typed fields only — the value inputs change with the coupon kind.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-1">
                <div className="grid gap-1.5">
                  <Label htmlFor="cpn-code">Code</Label>
                  <Input
                    id="cpn-code"
                    autoFocus
                    className="font-mono"
                    placeholder="WELCOME10"
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cpn-name">Name</Label>
                  <Input
                    id="cpn-name"
                    placeholder="Welcome offer"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Kind</Label>
                  <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as CouponKind })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CREATABLE_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {draft.kind === "first_order" && (
                  <div className="grid gap-1.5">
                    <Label>Discount mode</Label>
                    <Select
                      value={draft.mode}
                      onValueChange={(v) => setDraft({ ...draft, mode: v as "percentage" | "fixed" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed">Fixed amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(draft.kind === "percentage" ||
                  (draft.kind === "first_order" && draft.mode === "percentage")) && (
                  <NumberField
                    id="cpn-pct"
                    label="Percentage off"
                    suffix="%"
                    min={0}
                    max={100}
                    value={draft.valuePct}
                    onChange={(v) => setDraft({ ...draft, valuePct: v })}
                  />
                )}
                {(draft.kind === "fixed" || (draft.kind === "first_order" && draft.mode === "fixed")) && (
                  <NumberField
                    id="cpn-amt"
                    label="Amount off"
                    prefix="$"
                    min={0}
                    value={draft.valueAmount}
                    onChange={(v) => setDraft({ ...draft, valueAmount: v })}
                  />
                )}
                {draft.kind === "free_delivery" && (
                  <p className="text-muted-foreground rounded-lg border px-3 py-2 text-xs">
                    Free delivery resolves to $0 until a discrete delivery line exists in pricing.
                  </p>
                )}

                <div className="grid gap-1.5">
                  <Label>Plan types</Label>
                  <Multiselect
                    options={PLAN_TYPES}
                    value={draft.planTypes}
                    onChange={(v) => setDraft({ ...draft, planTypes: v })}
                    placeholder="All plans"
                    searchPlaceholder="Search plans..."
                    emptyText="No plan found."
                  />
                  <p className="text-muted-foreground text-xs">Leave empty to allow all plans.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <NumberField
                    id="cpn-min"
                    label="Min subtotal"
                    prefix="$"
                    min={0}
                    value={draft.minSubtotal}
                    onChange={(v) => setDraft({ ...draft, minSubtotal: v })}
                  />
                  <NumberField
                    id="cpn-maxr"
                    label="Total uses (all customers)"
                    min={1}
                    step={1}
                    value={draft.maxRedemptions}
                    onChange={(v) => setDraft({ ...draft, maxRedemptions: v })}
                  />
                  <NumberField
                    id="cpn-maxu"
                    label="Max uses (per account)"
                    min={1}
                    step={1}
                    value={draft.maxPerUser}
                    onChange={(v) => setDraft({ ...draft, maxPerUser: v })}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="cpn-start">Starts at ({BUSINESS_TZ_LABEL})</Label>
                    <Input
                      id="cpn-start"
                      type="datetime-local"
                      value={draft.startsAt}
                      onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cpn-end">Expires at ({BUSINESS_TZ_LABEL})</Label>
                    <Input
                      id="cpn-end"
                      type="datetime-local"
                      value={draft.expiresAt}
                      onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
                    />
                  </div>
                </div>

                <ToggleRow
                  id="cpn-auto"
                  label="Auto-apply"
                  hint="Applies automatically at checkout when valid — no code needed; great for festival/launch promos."
                  checked={draft.autoApply}
                  onChange={(v) => setDraft({ ...draft, autoApply: v })}
                />
                <ToggleRow
                  id="cpn-stack"
                  label="Stackable"
                  hint="Stackable coupons (auto-applied or entered) combine into the best discount; may also ride alongside one rep daily coupon. Leave off to require this coupon be used alone."
                  checked={draft.stackable}
                  onChange={(v) => setDraft({ ...draft, stackable: v })}
                />
                <ToggleRow
                  id="cpn-active"
                  label="Active"
                  hint="Inactive coupons are rejected at checkout."
                  checked={draft.active}
                  onChange={(v) => setDraft({ ...draft, active: v })}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDraft(null)} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={pending} className="transition-transform active:scale-[0.96]">
                  {draft.publicId ? "Save" : "Create"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// Exact loading twin: same SectionCard + same COLUMNS/Table markup, grey cells
// instead of data. Rendered as the page's <Suspense fallback>, so it always
// matches CouponsManager by construction.
export function CouponsManagerSkeleton() {
  return (
    <SectionCard
      title="Coupons"
      subtitle="Codes customers enter at checkout. Rep daily coupons are minted automatically and not shown here."
      action={<Skeleton className="h-8 w-28" />}
    >
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className={cn("align" in c && "text-right", "width" in c && c.width)}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, r) => (
            <TableRow key={r}>
              {COLUMNS.map((c) => (
                <TableCell key={c.key} className={"align" in c ? "text-right" : undefined}>
                  <Skeleton
                    className={cn(
                      "h-4",
                      c.key === "actions" ? "w-16" : "w-full max-w-32",
                      "align" in c && "ml-auto",
                    )}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
};
