"use client";

import { useSearchParams } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";

/** Downloads the Leads tab open now with its filters; every page, not just the visible one. */
export function InquiriesExportButton() {
  const sp = useSearchParams();
  if (sp.get("view") === "renewals") return null;
  return (
    <Button variant="outline" render={<a href={`/api/inquiries/export?${sp}`} download />}>
      <DownloadIcon className="size-4" />
      Export
    </Button>
  );
}
