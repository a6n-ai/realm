"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import type { KitchenPackingSheet } from "@/lib/services/kitchen-packing-sheet.service";
import { writeKitchenPackingWorkbook } from "./kitchen-packing-excel";

export function LabelsExportButton({
  sheet,
  dateIso,
}: {
  sheet: KitchenPackingSheet;
  dateIso: string;
}) {
  async function exportExcel() {
    await writeKitchenPackingWorkbook(sheet, `kitchen-packing-${dateIso}.xlsx`);
  }

  return (
    <Button variant="outline" disabled={sheet.rows.length === 0} onClick={exportExcel}>
      <DownloadIcon data-icon="inline-start" />
      Export to Excel
    </Button>
  );
}
