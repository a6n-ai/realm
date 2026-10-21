"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SlidersHorizontalIcon } from "lucide-react";
import type { CouponKind, DiscountPolicy } from "@/db/schema/coupons";
import { DataTable, SectionCard, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { Switch } from "@foundry/ui/switch";
import { TableCell } from "@foundry/ui/table";
import { saveDiscountPolicy } from "../actions";

export type KindRow = { kind: CouponKind; label: string; live: number; uses: number; discounted: number };

const CARD = {
  title: "Enabled coupon kinds",
  subtitle: "Which coupon kinds may be created and honored across the platform. Uses and discount follow the selected dates.",
} as const;

const COLUMNS = [
  { key: "kind", label: "Kind" },
  { key: "live", label: "Live coupons", align: "right" },
  { key: "uses", label: "Uses", align: "right" },
  { key: "discounted", label: "Discounted", align: "right" },
  { key: "enabled", label: "Enabled", width: "w-24" },
] as const satisfies readonly Column<string>[];

export function KindsForm({
  policy, rows, spec, pagination,
}: {
  policy: DiscountPolicy;
  rows: KindRow[];
  spec: FacetDef[];
  pagination: { page: number; size: number };
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [kinds, setKinds] = React.useState<CouponKind[]>(policy.enabledKinds);

  const dirty =
    kinds.length !== policy.enabledKinds.length ||
    kinds.some((k) => !policy.enabledKinds.includes(k));

  const toggle = (k: CouponKind, on: boolean) =>
    setKinds((cur) => (on ? [...cur.filter((x) => x !== k), k] : cur.filter((x) => x !== k)));

  const save = () => {
    start(async () => {
      try {
        await saveDiscountPolicy({ ...policy, enabledKinds: kinds });
        toast.success("Enabled kinds saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard
      bleed
      title={CARD.title}
      subtitle={CARD.subtitle}
      action={
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          Save kinds
        </Button>
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.kind}
        serial={false}
        filters={<ListSearchFilters spec={spec} placeholder="Search kinds…" shortPlaceholder="Search…" />}
        pagination={pagination}
        rowClassName={(r) => (kinds.includes(r.kind) ? "" : "opacity-60")}
        emptyIcon={SlidersHorizontalIcon}
        emptyMessage="No coupon kinds."
        emptySearchMessage="No kinds match your search or filters."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">{r.label}</TableCell>
            <TableCell className="text-right tabular-nums">{r.live.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{r.uses.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">${r.discounted.toFixed(2)}</TableCell>
            <TableCell>
              <Switch aria-label={`${r.label} enabled`} checked={kinds.includes(r.kind)} onCheckedChange={(on) => toggle(r.kind, on)} />
            </TableCell>
          </>
        )}
      />
    </SectionCard>
  );
}

// Loading twin: same SectionCard and the DataTable skeleton fed the same COLUMNS.
export function KindsFormSkeleton() {
  return (
    <SectionCard bleed title={CARD.title} subtitle={CARD.subtitle} action={<Skeleton className="h-8 w-24" />}>
      <DataTable.Skeleton columns={COLUMNS} serial={false} />
    </SectionCard>
  );
}
