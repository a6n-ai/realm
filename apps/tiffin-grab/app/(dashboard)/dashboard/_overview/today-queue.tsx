"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon } from "lucide-react";
import { DataTable, type Column, type FacetDef } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@foundry/ui/tooltip";
import { Badge } from "@/components/reui/badge";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { useTimezone } from "@/components/providers/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";
import { TODAY_KIND_LABEL, waitingLabel, type TodayItem, type TodayKind } from "@/lib/today/types";
import { VerifyPaymentButton } from "./verify-payment-button";

const COLUMNS: readonly Column<"type" | "who" | "what" | "since" | "action">[] = [
  { key: "type", label: "Type", width: "w-32" },
  { key: "who", label: "Who" },
  { key: "what", label: "What" },
  { key: "since", label: "Waiting since", width: "w-36" },
  { key: "action", label: "Action", align: "right", width: "w-28" },
];

const URGENCY_BADGE = { 1: "destructive-light", 2: "warning-light", 3: "secondary" } as const;

export function TodayQueue({
  rows,
  now,
  spec,
  failed,
  activeType,
}: {
  rows: TodayItem[];
  now: number;
  spec: FacetDef[];
  failed: TodayKind[];
  activeType: TodayKind | null;
}) {
  const router = useRouter();
  const tz = useTimezone();
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        {failed.length > 0 ? (
          <div className="text-destructive flex flex-wrap items-center gap-2 text-sm" role="alert">
            <span>Couldn&apos;t load {failed.map((k) => TODAY_KIND_LABEL[k]).join(", ")}.</span>
            <Button variant="link" size="sm" onClick={() => router.refresh()}>
              Retry
            </Button>
          </div>
        ) : null}
        <DataTable
          pagination="client"
          pageSize={10}
          serial={false}
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.key}
          filters={<ReuiFacetFilters spec={spec} />}
          emptyIcon={CheckCircle2Icon}
          emptyMessage={activeType ? `Nothing is waiting in ${TODAY_KIND_LABEL[activeType]}.` : "Nothing is waiting. Every list is clear."}
          emptyAction={
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/orders">Go to Orders</Link>
            </Button>
          }
          renderRow={(r) => (
            <>
              <TableCell>
                <Badge variant={URGENCY_BADGE[r.urgency]}>{TODAY_KIND_LABEL[r.kind]}</Badge>
              </TableCell>
              <TableCell className="font-medium">{r.who}</TableCell>
              <TableCell className="text-muted-foreground">{r.what}</TableCell>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="tabular-nums">{waitingLabel(r.since, now)}</span>
                  </TooltipTrigger>
                  <TooltipContent>{formatEpoch(r.since, { mode: "datetime", timeZone: tz })}</TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell className="text-right">
                {r.kind === "payment" && r.canVerify ? (
                  <VerifyPaymentButton who={r.who} payment={r.payment} />
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={r.href}>Open</Link>
                  </Button>
                )}
              </TableCell>
            </>
          )}
        />
      </div>
    </TooltipProvider>
  );
}
