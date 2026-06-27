"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DiscountPolicy } from "@/db/schema/coupons";
import { SectionCard } from "@/components/ds";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NumberField, ToggleRow, numOrNull } from "../controls";
import { saveDiscountPolicy, setRepCeiling } from "../actions";

type RepOption = { publicId: string; name: string | null; email: string | null };

export function RepAllowanceForm({ reps, policy }: { reps: RepOption[]; policy: DiscountPolicy }) {
  return (
    <div className="grid gap-6">
      <GlobalCeilingsSection policy={policy} />
      <PerRepSection reps={reps} policy={policy} />
    </div>
  );
}

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
        <Button onClick={save} disabled={pending || !dirty} className="w-fit">
          Save ceilings
        </Button>
      </div>
    </SectionCard>
  );
}

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
