"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import type { PackingLabelRow } from "@/lib/services/labels.service";
import { LABEL_COLUMNS, labelRowToExcelRecord } from "./label-columns";

export function LabelsExportButton({ rows, dateIso }: { rows: PackingLabelRow[]; dateIso: string }) {
  async function exportExcel() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(
      rows.map((r) => labelRowToExcelRecord(r)),
      { header: LABEL_COLUMNS.map((c) => c.header) },
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Labels");
    XLSX.writeFile(workbook, `labels-${dateIso}.xlsx`);
  }

  return (
    <Button variant="outline" disabled={rows.length === 0} onClick={exportExcel}>
      <DownloadIcon data-icon="inline-start" />
      Export to Excel
    </Button>
  );
}
