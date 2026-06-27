"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronsUpDownIcon, PencilIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { tzOffsetMinutes } from "@tiffin/commons";
import type { CouponConfig, CouponKind, DiscountPolicy } from "@/db/schema/coupons";
import type { planType } from "@/db/schema/catalog";
import { SectionCard } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { saveCoupon, saveDiscountPolicy, setCouponActive, setRepCeiling } from "./actions";

// Local label tables — kept out of the server schema import so no drizzle code
// is pulled into the client bundle (the enum types above are erased at compile).
const KIND_LABELS: Record<CouponKind, string> = {
  percentage: "Percentage off",
  fixed: "Fixed amount off",
  free_delivery: "Free delivery",
  first_order: "First order",
  rep_daily: "Rep daily",
};
const ALL_KINDS = Object.keys(KIND_LABELS) as CouponKind[];
const CREATABLE_KINDS = ALL_KINDS.filter((k) => k !== "rep_daily");
// Keyed by the plan_type enum (type-only import — erased at compile, no drizzle in the
// client bundle) so adding an enum value is a compile error rather than silent drift.
type PlanType = (typeof planType.enumValues)[number];
const PLAN_LABEL: Record<PlanType, string> = { tiffin: "Tiffin", healthy: "Healthy" };
const PLAN_TYPES: { value: PlanType; label: string }[] = (Object.keys(PLAN_LABEL) as PlanType[]).map(
  (value) => ({ value, label: PLAN_LABEL[value] }),
);

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
type RepOption = { publicId: string; name: string | null; email: string | null };

const money = (s: string | null): string => (s == null ? "—" : `$${Number(s).toFixed(2)}`);
const pct = (s: string | null): string => (s == null ? "—" : `${Number(s)}%`);
const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

// Coupon windows are entered/displayed in a fixed business zone (staff are IST) so the
// stored absolute instant is unambiguous regardless of the admin's browser zone (TD-4).
const BUSINESS_TZ = "Asia/Kolkata";
const BUSINESS_TZ_LABEL = "IST";

// epoch-ms <-> <input type="datetime-local"> value, anchored to BUSINESS_TZ (not the viewer's).
function toLocalInput(ms: number | null): string {
  if (ms == null) return "";
  const wall = ms + tzOffsetMinutes(BUSINESS_TZ, ms) * 60000;
  return new Date(wall).toISOString().slice(0, 16);
}
function fromLocalInput(s: string): number | null {
  if (!s) return null;
  // Treat the entered wall-clock as BUSINESS_TZ, then convert to the absolute instant.
  const asUtc = new Date(`${s}:00Z`).getTime();
  if (!Number.isFinite(asUtc)) return null;
  return asUtc - tzOffsetMinutes(BUSINESS_TZ, asUtc) * 60000;
}

export function DiscountsManager({
  coupons,
  reps,
  policy,
}: {
  coupons: CouponRow[];
  reps: RepOption[];
  policy: DiscountPolicy;
}) {
  return (
    <div className="grid gap-6">
      <CouponsSection coupons={coupons} />
      <GlobalCeilingsSection policy={policy} />
      <PerRepSection reps={reps} policy={policy} />
      <EnabledKindsSection policy={policy} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// (a) Coupon CRUD
// ---------------------------------------------------------------------------

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

function CouponsSection({ coupons }: { coupons: CouponRow[] }) {
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
              <TableHead>Code</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-px" />
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

// ---------------------------------------------------------------------------
// (b) Global rep ceilings
// ---------------------------------------------------------------------------

function GlobalCeilingsSection({ policy }: { policy: DiscountPolicy }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [enabled, setEnabled] = React.useState(policy.repDaily.enabled);
  const [capPct, setCapPct] = React.useState(String(policy.repDaily.defaultCapPct));
  const [capAmount, setCapAmount] = React.useState(String(policy.repDaily.defaultCapAmount));

  const dirty =
    enabled !== policy.repDaily.enabled ||
    Number(capPct) !== policy.repDaily.defaultCapPct ||
    Number(capAmount) !== policy.repDaily.defaultCapAmount;

  const save = () => {
    const pctN = numOrNull(capPct);
    const amtN = numOrNull(capAmount);
    if (pctN == null || amtN == null) {
      toast.error("Both ceilings are required");
      return;
    }
    start(async () => {
      try {
        await saveDiscountPolicy({
          ...policy,
          repDaily: { ...policy.repDaily, enabled, defaultCapPct: pctN, defaultCapAmount: amtN },
        });
        toast.success("Rep ceilings saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard
      title="Rep daily allowance"
      subtitle="The daily discount each sales rep may grant. The lower of the two ceilings applies to any single rep discount."
    >
      <div className="grid gap-4">
        <ToggleRow
          id="rep-enabled"
          label="Enable rep daily coupons"
          hint="When off, reps cannot grant discounts and no daily coupons are minted."
          checked={enabled}
          onChange={setEnabled}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:max-w-md">
          <NumberField
            id="rep-pct"
            label="Default cap (%)"
            suffix="%"
            min={0}
            max={100}
            value={capPct}
            onChange={setCapPct}
          />
          <NumberField
            id="rep-amt"
            label="Default cap ($)"
            prefix="$"
            min={0}
            value={capAmount}
            onChange={setCapAmount}
          />
        </div>
        <Button onClick={save} disabled={pending || !dirty} className="w-fit">
          Save ceilings
        </Button>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// (c) Per-rep overrides
// ---------------------------------------------------------------------------

function PerRepSection({ reps, policy }: { reps: RepOption[]; policy: DiscountPolicy }) {
  return (
    <SectionCard
      title="Per-rep overrides"
      subtitle="Override the default ceilings for an individual rep, or disable their allowance. Blank fields fall back to the global default."
    >
      {reps.length === 0 ? (
        <p className="text-muted-foreground text-sm">No sales reps (members) yet.</p>
      ) : (
        <div className="grid gap-3">
          {reps.map((rep) => (
            <RepRow key={rep.publicId} rep={rep} override={policy.repDaily.perRep[rep.publicId]} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function RepRow({
  rep,
  override,
}: {
  rep: RepOption;
  override?: { capPct?: number; capAmount?: number; active: boolean };
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [capPct, setCapPct] = React.useState(override?.capPct == null ? "" : String(override.capPct));
  const [capAmount, setCapAmount] = React.useState(override?.capAmount == null ? "" : String(override.capAmount));
  const [active, setActive] = React.useState(override?.active ?? true);

  const save = () => {
    start(async () => {
      try {
        await setRepCeiling(rep.publicId, {
          capPct: numOrNull(capPct) ?? undefined,
          capAmount: numOrNull(capAmount) ?? undefined,
          active,
        });
        toast.success(`Saved ${rep.name ?? rep.publicId}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <div className={cn("rounded-lg border p-3", !active && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{rep.name ?? rep.email ?? rep.publicId}</span>
          <Badge variant="secondary">Member</Badge>
        </div>
        <ToggleRow id={`rep-${rep.publicId}`} label="Allowed" checked={active} onChange={setActive} inline />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <NumberField
          id={`rep-${rep.publicId}-pct`}
          label="Cap (%)"
          suffix="%"
          min={0}
          max={100}
          placeholder="default"
          value={capPct}
          onChange={setCapPct}
          className="w-32"
        />
        <NumberField
          id={`rep-${rep.publicId}-amt`}
          label="Cap ($)"
          prefix="$"
          min={0}
          placeholder="default"
          value={capAmount}
          onChange={setCapAmount}
          className="w-32"
        />
        <Button onClick={save} disabled={pending} size="sm" variant="outline">
          Save
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// (d) Enabled kinds
// ---------------------------------------------------------------------------

function EnabledKindsSection({ policy }: { policy: DiscountPolicy }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [kinds, setKinds] = React.useState<string[]>(policy.enabledKinds);

  const dirty =
    kinds.length !== policy.enabledKinds.length || kinds.some((k) => !policy.enabledKinds.includes(k as CouponKind));

  const save = () => {
    start(async () => {
      try {
        await saveDiscountPolicy({ ...policy, enabledKinds: kinds as CouponKind[] });
        toast.success("Enabled kinds saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard
      title="Enabled coupon kinds"
      subtitle="Which coupon kinds may be created and honored across the platform."
    >
      <div className="grid max-w-md gap-3">
        <Multiselect
          options={ALL_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
          value={kinds}
          onChange={setKinds}
          placeholder="Select kinds"
          searchPlaceholder="Search kinds..."
          emptyText="No kind found."
        />
        <Button onClick={save} disabled={pending || !dirty} className="w-fit">
          Save kinds
        </Button>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Shared typed controls
// ---------------------------------------------------------------------------

function NumberField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  step,
  placeholder,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step ?? "any"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("tabular-nums", prefix && "pl-7", suffix && "pr-8")}
        />
        {suffix && (
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
  inline,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Multiselect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
}) {
  const [open, setOpen] = React.useState(false);
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <li key={v}>
              <Badge
                variant="secondary"
                className="cursor-pointer gap-1 pr-1"
                onClick={() => toggle(v)}
                role="button"
                aria-label={`Remove ${labelOf(v)}`}
              >
                {labelOf(v)}
                <XIcon className="size-3 opacity-70" aria-hidden />
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="text-muted-foreground w-full justify-between font-normal"
          >
            {value.length > 0 ? `${value.length} selected` : placeholder}
            <ChevronsUpDownIcon className="size-4 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => {
                  const selected = value.includes(o.value);
                  return (
                    <CommandItem
                      key={o.value}
                      value={o.value}
                      keywords={[o.label]}
                      data-checked={selected}
                      aria-checked={selected}
                      onSelect={() => toggle(o.value)}
                    >
                      {o.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
