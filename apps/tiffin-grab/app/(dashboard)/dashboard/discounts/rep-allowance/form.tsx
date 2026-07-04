"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DiscountPolicy } from "@/db/schema/coupons";
import { SectionCard } from "@/components/ds";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import { cn } from "@/lib/utils";
import { NumberField, ToggleRow, numOrNull } from "../controls";
import { saveDiscountPolicy, setRepCeiling } from "../actions";

type RepOption = { publicId: string; name: string | null; email: string | null };

// Single source of truth for the two section headers, consumed by both the real
// sections and the .Skeleton twin so the loading state can't drift from them.
const GLOBAL_SECTION = {
  title: "Rep daily allowance",
  subtitle:
    "The daily discount each sales rep may grant. The lower of the two ceilings applies to any single rep discount.",
} as const;
const PER_REP_SECTION = {
  title: "Per-rep overrides",
  subtitle:
    "Override the default ceilings for an individual rep, or disable their allowance. Blank fields fall back to the global default.",
} as const;

export function RepAllowanceForm({ reps, policy }: { reps: RepOption[]; policy: DiscountPolicy }) {
  return (
    <div className="grid gap-6">
      <GlobalCeilingsSection policy={policy} />
      <PerRepSection reps={reps} policy={policy} />
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
    <div className="grid gap-6">
      <SectionCard title={GLOBAL_SECTION.title} subtitle={GLOBAL_SECTION.subtitle}>
        <div className="grid gap-4">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="grid gap-0.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:max-w-md sm:grid-cols-2">
            {field()}
            {field()}
          </div>
          <div className="grid gap-1.5 sm:max-w-[13rem]">
            {field()}
            <Skeleton className="h-3 w-full" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
      </SectionCard>
      <SectionCard title={PER_REP_SECTION.title} subtitle={PER_REP_SECTION.subtitle}>
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                {field("w-32")}
                {field("w-32")}
                {field("w-32")}
                <Skeleton className="h-8 w-16" />
              </div>
            </div>
          ))}
        </div>
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

  const dirty =
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
          },
        });
        toast.success("Rep ceilings saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard title={GLOBAL_SECTION.title} subtitle={GLOBAL_SECTION.subtitle}>
      <div className="grid gap-4">
        <ToggleRow
          id="rep-enabled"
          label="Enable rep daily coupons"
          hint="When off, reps cannot grant discounts and no daily coupons are minted."
          checked={enabled}
          onChange={setEnabled}
        />
        <div className="grid grid-cols-1 gap-4 sm:max-w-md sm:grid-cols-2">
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
        <div className="grid gap-1.5 sm:max-w-[13rem]">
          <NumberField
            id="rep-daily-uses"
            label="Discounts per day"
            min={1}
            max={99}
            step={1}
            value={dailyUses}
            onChange={setDailyUses}
          />
          <p className="text-muted-foreground text-xs text-pretty">
            How many discounts each rep can give per day. Sets a daily target so reps don&apos;t discount every order.
          </p>
        </div>
        <Button onClick={save} disabled={pending || !dirty} className="w-fit">
          Save ceilings
        </Button>
      </div>
    </SectionCard>
  );
}

function PerRepSection({ reps, policy }: { reps: RepOption[]; policy: DiscountPolicy }) {
  return (
    <SectionCard title={PER_REP_SECTION.title} subtitle={PER_REP_SECTION.subtitle}>
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
        <NumberField
          id={`rep-${rep.publicId}-uses`}
          label="Per day"
          min={1}
          max={99}
          step={1}
          placeholder="default"
          value={dailyUses}
          onChange={setDailyUses}
          className="w-32"
        />
        <Button onClick={save} disabled={pending} size="sm" variant="outline">
          Save
        </Button>
      </div>
    </div>
  );
}
