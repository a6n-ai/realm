"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DiscountPolicy } from "@/db/schema/coupons";
import { DataTable, RowActionTooltipButton, SectionCard, type Column, type FacetDef, type StatItem } from "@/components/ds";
import { DiscountStats, DiscountStatsSkeleton } from "../discount-stats";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { Switch } from "@foundry/ui/switch";
import { Loader2Icon, SaveIcon, UsersIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { TableCell } from "@foundry/ui/table";
import { NumberField, ToggleRow, numOrNull } from "../controls";
import { saveDiscountPolicy, setRepCeiling } from "../actions";

type RepOption = { publicId: string; name: string | null; email: string | null; role: string };

// Single source of truth for the two section headers, consumed by both the real
// sections and the .Skeleton twin so the loading state can't drift from them.
const GLOBAL_SECTION = {
  title: "Staff discount allowance",
  subtitle:
    "What each staff member may give per day, either applied on an order they create or as a one-off code from Estimate or Create coupon. The lower of the two ceilings applies to any single discount.",
} as const;
const PER_REP_SECTION = {
  title: "Per-rep overrides",
  subtitle:
    "Override the default ceilings for an individual staff member, or disable their allowance. Blank fields fall back to the global default.",
} as const;

export function RepAllowanceForm({
  reps, policy, stats, pagination, repSpec,
}: {
  reps: RepOption[];
  policy: DiscountPolicy;
  stats: StatItem[];
  pagination: { page: number; size: number };
  repSpec: FacetDef[];
}) {
  return (
    <div className="grid grid-cols-1 gap-6">
      <DiscountStats items={stats} />
      <GlobalCeilingsSection policy={policy} />
      <PerRepSection reps={reps} policy={policy} pagination={pagination} spec={repSpec} />
    </div>
  );
}

// Exact loading twin: same SectionCard wrappers/titles + same field layout as the
// real sections, grey blocks where inputs go. Rendered as the page's <Suspense
// fallback>, so it stays in sync with RepAllowanceForm by construction.
export function RepAllowanceFormSkeleton() {
  const field = (className?: string) => (
    <div className={cn("grid gap-1.5", className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-6">
      <DiscountStatsSkeleton />
      <SectionCard title={GLOBAL_SECTION.title} subtitle={GLOBAL_SECTION.subtitle} action={<Skeleton className="h-8 w-28" />}>
        <div className="grid gap-4">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="grid gap-0.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="grid gap-1.5">
                {field()}
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
      <SectionCard title={PER_REP_SECTION.title} subtitle={PER_REP_SECTION.subtitle}>
        <DataTable.Skeleton columns={PER_REP_COLUMNS} serial={false} />
      </SectionCard>
    </div>
  );
};

function GlobalCeilingsSection({ policy }: { policy: DiscountPolicy }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [enabled, setEnabled] = React.useState(policy.repDaily.enabled);
  const [capPct, setCapPct] = React.useState(String(policy.repDaily.defaultCapPct));
  const [capAmount, setCapAmount] = React.useState(String(policy.repDaily.defaultCapAmount));
  const [dailyUses, setDailyUses] = React.useState(String(policy.repDaily.defaultDailyUses));
  const [validity, setValidity] = React.useState(String(policy.repDaily.codeValidityHours));

  const dirty =
    (numOrNull(validity) ?? policy.repDaily.codeValidityHours) !== policy.repDaily.codeValidityHours ||
    enabled !== policy.repDaily.enabled ||
    Number(capPct) !== policy.repDaily.defaultCapPct ||
    Number(capAmount) !== policy.repDaily.defaultCapAmount ||
    (numOrNull(dailyUses) ?? policy.repDaily.defaultDailyUses) !== policy.repDaily.defaultDailyUses;

  const save = () => {
    const pctN = numOrNull(capPct);
    const amtN = numOrNull(capAmount);
    const usesN = numOrNull(dailyUses);
    if (pctN == null || amtN == null) {
      toast.error("Both ceilings are required");
      return;
    }
    if (usesN == null || usesN < 1 || !Number.isInteger(usesN)) {
      toast.error("Discounts per day must be a whole number of 1 or more");
      return;
    }
    const hoursN = numOrNull(validity);
    if (hoursN == null || hoursN < 1 || hoursN > 720 || !Number.isInteger(hoursN)) {
      toast.error("Code validity must be a whole number of hours from 1 to 720");
      return;
    }
    start(async () => {
      try {
        await saveDiscountPolicy({
          ...policy,
          repDaily: {
            ...policy.repDaily,
            enabled,
            defaultCapPct: pctN,
            defaultCapAmount: amtN,
            defaultDailyUses: usesN,
            codeValidityHours: hoursN,
          },
        });
        toast.success("Rep ceilings saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  const field = (hint: string, node: React.ReactNode) => (
    <div className="grid content-start gap-1.5">
      {node}
      <p className="text-muted-foreground text-xs text-pretty">{hint}</p>
    </div>
  );

  return (
    <SectionCard
      title={GLOBAL_SECTION.title}
      subtitle={GLOBAL_SECTION.subtitle}
      action={
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          Save ceilings
        </Button>
      }
    >
      <div className="grid gap-4">
        <ToggleRow
          id="rep-enabled"
          label="Enable staff discounts"
          hint="When off, staff cannot give discounts or create codes, and no daily coupons are minted."
          checked={enabled}
          onChange={setEnabled}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {field("Largest share of an order one discount may take.", (
            <NumberField id="rep-pct" label="Default cap (%)" suffix="%" min={0} max={100} value={capPct} onChange={setCapPct} />
          ))}
          {field("Largest dollar amount one discount may take.", (
            <NumberField id="rep-amt" label="Default cap ($)" prefix="$" min={0} value={capAmount} onChange={setCapAmount} />
          ))}
          {field("Per staff member, applied discounts and created codes together.", (
            <NumberField id="rep-daily-uses" label="Discounts per day" min={1} max={99} step={1} value={dailyUses} onChange={setDailyUses} />
          ))}
          {field("Codes from Estimate and Create coupon stop working this many hours after they are made.", (
            <NumberField id="rep-code-validity" label="Code validity (hours)" min={1} max={720} step={1} value={validity} onChange={setValidity} />
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

const PER_REP_COLUMNS = [
  { key: "staff", label: "Staff" },
  { key: "role", label: "Role" },
  { key: "capPct", label: "Cap (%)", width: "w-32" },
  { key: "capAmount", label: "Cap ($)", width: "w-32" },
  { key: "dailyUses", label: "Per day", width: "w-28" },
  { key: "allowed", label: "Allowed", width: "w-24" },
  { key: "actions", label: "", align: "right", width: "w-24" },
] as const satisfies readonly Column<string>[];

function PerRepSection({ reps, policy, pagination, spec }: { reps: RepOption[]; policy: DiscountPolicy; pagination: { page: number; size: number }; spec: FacetDef[] }) {
  const rows = reps.map((r) => ({ ...r, label: r.name ?? r.email ?? r.publicId }));
  return (
    <SectionCard title={PER_REP_SECTION.title} subtitle={PER_REP_SECTION.subtitle}>
      <DataTable
        columns={PER_REP_COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        filters={<ListSearchFilters spec={spec} placeholder="Search staff…" shortPlaceholder="Search…" />}
        pagination={pagination}
        emptyIcon={UsersIcon}
        emptyMessage="No staff yet."
        emptySearchMessage="No staff match your search or filters."
        renderRow={(r) => <RepCells key={r.publicId} rep={r} override={policy.repDaily.perRep[r.publicId]} />}
      />
    </SectionCard>
  );
}

// One row's cells. Each row edits and saves on its own, so it keeps its own draft.
function RepCells({
  rep,
  override,
}: {
  rep: RepOption & { label: string };
  override?: { capPct?: number; capAmount?: number; dailyUses?: number; active: boolean };
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [capPct, setCapPct] = React.useState(override?.capPct == null ? "" : String(override.capPct));
  const [capAmount, setCapAmount] = React.useState(override?.capAmount == null ? "" : String(override.capAmount));
  const [dailyUses, setDailyUses] = React.useState(override?.dailyUses == null ? "" : String(override.dailyUses));
  const [active, setActive] = React.useState(override?.active ?? true);

  const save = () => {
    const usesN = numOrNull(dailyUses);
    if (usesN != null && (usesN < 1 || !Number.isInteger(usesN))) {
      toast.error("Discounts per day must be a whole number of 1 or more");
      return;
    }
    start(async () => {
      try {
        await setRepCeiling(rep.publicId, {
          capPct: numOrNull(capPct) ?? undefined,
          capAmount: numOrNull(capAmount) ?? undefined,
          dailyUses: usesN ?? undefined,
          active,
        });
        toast.success(`Saved ${rep.label}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  const muted = !active && "opacity-60";
  return (
    <>
      <TableCell className={cn(muted)}>
        <span className="block truncate text-sm font-medium">{rep.label}</span>
        {rep.name && rep.email && <span className="text-muted-foreground block truncate text-xs">{rep.email}</span>}
      </TableCell>
      <TableCell className={cn(muted)}>
        <Badge variant="secondary" className="capitalize">{rep.role}</Badge>
      </TableCell>
      <TableCell>
        <NumberField id={`rep-${rep.publicId}-pct`} label={`${rep.label} cap (%)`} hideLabel suffix="%" min={0} max={100} placeholder="default" value={capPct} onChange={setCapPct} />
      </TableCell>
      <TableCell>
        <NumberField id={`rep-${rep.publicId}-amt`} label={`${rep.label} cap ($)`} hideLabel prefix="$" min={0} placeholder="default" value={capAmount} onChange={setCapAmount} />
      </TableCell>
      <TableCell>
        <NumberField id={`rep-${rep.publicId}-uses`} label={`${rep.label} discounts per day`} hideLabel min={1} step={1} placeholder="default" value={dailyUses} onChange={setDailyUses} />
      </TableCell>
      <TableCell>
        <Switch aria-label={`${rep.label} allowed`} checked={active} onCheckedChange={setActive} />
      </TableCell>
      <TableCell className="text-right">
        <RowActionTooltipButton icon={pending ? Loader2Icon : SaveIcon} label={`Save ${rep.label}`} hint="Save" onClick={save} disabled={pending} />
      </TableCell>
    </>
  );
}
