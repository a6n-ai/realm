"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { NumberField } from "../discounts/controls";
import { addMealPayoutOverride, removeMealPayoutOverride, saveMealPayoutRow, type MealPayoutAwardResult } from "./actions";

// Every save/add awards coins to every currently-active order the rule newly
// matches (see wallet.service.ts::awardMealPayoutRule) — surface that result
// rather than a flat "saved", since that's the part with real consequences.
function awardMessage(prefix: string, result: MealPayoutAwardResult): string {
  const cappedSuffix = result.capped > 0
    ? ` — ${result.capped} blocked (would exceed the wallet cap)`
    : "";
  if (result.awarded === 0) return `${prefix} — no new customers to award${cappedSuffix}`;
  const each = result.coinsPerCustomer === 1 ? "1 coin" : `${result.coinsPerCustomer} coins`;
  const customers = result.awarded === 1 ? "customer" : "customers";
  return `${prefix} — ${result.awarded} ${customers} awarded ${each} each${cappedSuffix}`;
}

const CARD_TITLE = "Meal payouts";
const CARD_SUBTITLE =
  "Coins awarded by meal size and subscription duration. The default rule applies unless a more specific one is added below.";

export type MealSizeOption = { publicId: string; name: string };
export type DurationPackageOption = { publicId: string; weeks: number };

export type MealPayoutRow = {
  id: string;
  mealSizePublicId: string | null;
  mealSizeName: string | null;
  durationPackagePublicId: string | null;
  durationWeeks: number | null;
  coins: number;
};

export function MealPayoutGrid({
  rows,
  mealSizes,
  durationPackages,
}: {
  rows: MealPayoutRow[];
  mealSizes: MealSizeOption[];
  durationPackages: DurationPackageOption[];
}) {
  const [adding, setAdding] = React.useState(false);
  const defaultRow = rows.find((r) => r.mealSizePublicId === null);
  const overrides = rows.filter((r) => r.mealSizePublicId !== null);

  return (
    <SectionCard
      title={CARD_TITLE}
      subtitle={CARD_SUBTITLE}
      action={
        <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ Add override"}
        </Button>
      }
    >
      <div className="grid gap-3">
        {defaultRow && <DefaultRow row={defaultRow} />}
        {overrides.map((row) => (
          <OverrideRow key={row.id} row={row} />
        ))}
        {adding && (
          <AddOverrideForm
            mealSizes={mealSizes}
            durationPackages={durationPackages}
            onDone={() => setAdding(false)}
          />
        )}
      </div>
    </SectionCard>
  );
}

function RowShell({
  label,
  field,
  action,
}: {
  label: React.ReactNode;
  field: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">{label}</div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {field}
        {action}
      </div>
    </div>
  );
}

function DefaultRow({ row }: { row: MealPayoutRow }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [coins, setCoins] = React.useState(String(row.coins));

  const save = () => {
    const n = parseInt(coins, 10);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Coins must be a non-negative integer");
      return;
    }
    start(async () => {
      try {
        const result = await saveMealPayoutRow({ id: row.id, coins: n });
        toast.success(awardMessage("Default rule saved", result));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <RowShell
      label={
        <span className="text-sm font-medium">
          All meal sizes <span className="text-muted-foreground">·</span> All durations
        </span>
      }
      field={
        <NumberField
          id={`meal-payout-${row.id}-coins`}
          label="Coins"
          min={0}
          step={1}
          value={coins}
          onChange={setCoins}
          className="w-36"
        />
      }
      action={
        <Button onClick={save} disabled={pending} size="sm" variant="outline">
          Save
        </Button>
      }
    />
  );
}

function OverrideRow({ row }: { row: MealPayoutRow }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [removing, startRemove] = React.useTransition();
  const [coins, setCoins] = React.useState(String(row.coins));

  const save = () => {
    const n = parseInt(coins, 10);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Coins must be a non-negative integer");
      return;
    }
    start(async () => {
      try {
        const result = await saveMealPayoutRow({ id: row.id, coins: n });
        toast.success(awardMessage("Rule saved", result));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  const remove = () => {
    startRemove(async () => {
      try {
        await removeMealPayoutOverride({ id: row.id });
        toast.success("Rule removed");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to remove");
      }
    });
  };

  return (
    <RowShell
      label={
        <span className="text-sm font-medium">
          {row.mealSizeName} <span className="text-muted-foreground">·</span> {row.durationWeeks} weeks
        </span>
      }
      field={
        <NumberField
          id={`meal-payout-${row.id}-coins`}
          label="Coins"
          min={0}
          step={1}
          value={coins}
          onChange={setCoins}
          className="w-36"
        />
      }
      action={
        <div className="flex gap-2">
          <Button onClick={save} disabled={pending || removing} size="sm" variant="outline">
            Save
          </Button>
          <Button onClick={remove} disabled={pending || removing} size="sm" variant="ghost">
            Remove
          </Button>
        </div>
      }
    />
  );
}

function AddOverrideForm({
  mealSizes,
  durationPackages,
  onDone,
}: {
  mealSizes: MealSizeOption[];
  durationPackages: DurationPackageOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [mealSizePublicId, setMealSizePublicId] = React.useState<string>("");
  const [durationPackagePublicId, setDurationPackagePublicId] = React.useState<string>("");
  const [coins, setCoins] = React.useState("0");

  const save = () => {
    if (!mealSizePublicId || !durationPackagePublicId) {
      toast.error("Select a meal size and a duration");
      return;
    }
    const n = parseInt(coins, 10);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Coins must be a non-negative integer");
      return;
    }
    start(async () => {
      try {
        const result = await addMealPayoutOverride({ mealSizePublicId, durationPackagePublicId, coins: n });
        toast.success(awardMessage("Override added", result));
        router.refresh();
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add override");
      }
    });
  };

  return (
    <div className="rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label>Meal size</Label>
          <Select value={mealSizePublicId} onValueChange={setMealSizePublicId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select meal size" /></SelectTrigger>
            <SelectContent>
              {mealSizes.map((m) => (
                <SelectItem key={m.publicId} value={m.publicId}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Duration</Label>
          <Select value={durationPackagePublicId} onValueChange={setDurationPackagePublicId}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Select duration" /></SelectTrigger>
            <SelectContent>
              {durationPackages.map((d) => (
                <SelectItem key={d.publicId} value={d.publicId}>{d.weeks} weeks</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NumberField
          id="meal-payout-new-coins"
          label="Coins"
          min={0}
          step={1}
          value={coins}
          onChange={setCoins}
          className="w-36"
        />
        <Button onClick={save} disabled={pending} size="sm">
          Add
        </Button>
      </div>
    </div>
  );
}
