"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import type { DispatchRow } from "@/lib/services/optimoroute/drivers";
import { writeDispatchWorkbook } from "./dispatch-excel";

export function DispatchExportButton({
  dateIso,
  rows,
}: {
  dateIso: string;
  rows: DispatchRow[];
}) {
  async function exportExcel() {
    await writeDispatchWorkbook(dateIso, rows, `dispatch-${dateIso}.xlsx`);
  }

  return (
    <Button variant="outline" disabled={rows.length === 0} onClick={exportExcel}>
      <DownloadIcon data-icon="inline-start" />
      Export to Excel
    </Button>
  );
}
