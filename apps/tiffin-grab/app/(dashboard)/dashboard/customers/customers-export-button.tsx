"use client";

import { useSearchParams } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";

/** Downloads the listing with the filters and sort open now; every page, not just the visible one. */
export function CustomersExportButton() {
  const qs = new URLSearchParams(useSearchParams().toString());
  qs.delete("page");
  qs.delete("size");
  return (
    <Button variant="outline" asChild>
      <a href={`/api/customers/export?${qs}`} download>
        <DownloadIcon />
        Export
      </a>
    </Button>
  );
}
