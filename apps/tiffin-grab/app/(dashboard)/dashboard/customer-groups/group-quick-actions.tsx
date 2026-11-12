"use client";

import { unwrapAction } from "@/lib/actions/unwrap";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CoinsIcon, DownloadIcon, MailIcon, TicketPercentIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { RowActionTooltipButton } from "@/components/ds/row-action-tooltip-button";
import { exportGroupCsvAction } from "./actions";

/** Shortcuts into the feature pages; the actions themselves still run (and are guarded) there. */
function useGroupShortcuts(publicId: string, name: string) {
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const { csv } = await unwrapAction(exportGroupCsvAction(publicId));
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[\\/:*?"<>|]+/g, "_")}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The request did not finish.");
    } finally {
      setExporting(false);
    }
  }

  const id = encodeURIComponent(publicId);
  return {
    exporting,
    exportCsv,
    give: `/dashboard/wallet/give?group=${id}`,
    email: `/dashboard/notifications/campaigns?emailGroup=${id}`,
    coupon: `/dashboard/discounts/coupons?newForGroup=${id}`,
  };
}

/** Group detail header: labelled buttons. */
export function GroupHeaderActions({ publicId, name }: { publicId: string; name: string }) {
  const g = useGroupShortcuts(publicId, name);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild>
        <Link href={g.give}><CoinsIcon /> Give coins</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href={g.email}><MailIcon /> Email group</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href={g.coupon}><TicketPercentIcon /> Create group coupon</Link>
      </Button>
      <Button variant="outline" disabled={g.exporting} onClick={() => void g.exportCsv()}>
        <DownloadIcon /> Export CSV
      </Button>
    </div>
  );
}

/** Customer groups list: icon buttons with tooltips. */
export function GroupRowActions({ publicId, name }: { publicId: string; name: string }) {
  const router = useRouter();
  const g = useGroupShortcuts(publicId, name);
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <RowActionTooltipButton icon={CoinsIcon} label={`Give coins to ${name}`} hint="Give coins" onClick={() => router.push(g.give)} />
      <RowActionTooltipButton icon={MailIcon} label={`Email ${name}`} hint="Email group" onClick={() => router.push(g.email)} />
      <RowActionTooltipButton icon={TicketPercentIcon} label={`Create coupon for ${name}`} hint="Create group coupon" onClick={() => router.push(g.coupon)} />
      <RowActionTooltipButton icon={DownloadIcon} label={`Export ${name} as CSV`} hint="Export CSV" disabled={g.exporting} onClick={() => void g.exportCsv()} />
    </div>
  );
}
