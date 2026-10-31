"use client";

import { useState } from "react";
import Link from "next/link";
import { CoinsIcon, DownloadIcon, MailIcon, TicketPercentIcon, ZapIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { exportGroupCsvAction } from "./actions";

/** Shortcuts into the feature pages; the actions themselves still run (and are guarded) there. */
export function GroupQuickActions({ publicId, name, size }: { publicId: string; name: string; size?: "sm" }) {
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await exportGroupCsvAction(publicId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[\\/:*?"<>|]+/g, "_")}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      toast.error("The request did not finish.");
    } finally {
      setExporting(false);
    }
  }

  const id = encodeURIComponent(publicId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} aria-label={`Quick actions for ${name}`}>
          <ZapIcon /> Quick actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/wallet/give?group=${id}`}><CoinsIcon /> Give coins</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/notifications/campaigns?emailGroup=${id}`}><MailIcon /> Email group</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/discounts/coupons?newForGroup=${id}`}><TicketPercentIcon /> Create group coupon</Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={exporting} onSelect={() => void exportCsv()}>
          <DownloadIcon /> Export CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
