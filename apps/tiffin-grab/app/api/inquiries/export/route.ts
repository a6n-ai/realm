import { handler } from "@realm/routes";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { EXPORT_COLUMNS, inquiryRowToExcelRecord } from "@/app/(dashboard)/dashboard/inquiries/inquiry-export-columns";

// Same facet shape as the Inquiries pipeline page (app/(dashboard)/dashboard/inquiries/page.tsx)
// so a "Export" click respects whatever stage/owner/source/search filters are currently
// applied there. Only kind/field are needed to parse a Condition — option lists are for
// rendering the on-screen filter UI, not for this route.
const EXPORT_SPEC: FacetDef[] = [
  { kind: "pills", field: "stage", label: "Stage", options: [] },
  { kind: "select", field: "owner", label: "Owner", options: [] },
  { kind: "multi", field: "source", label: "Source", options: [] },
  { kind: "multi", field: "subsource", label: "Subsource", options: [], dependsOn: "source" },
  { kind: "dateRange", field: "createdAt", label: "Created" },
  { kind: "search", fields: ["fullName", "phone"] },
];

export const GET = handler(async (request: Request): Promise<Response> => {
  await requireStaff();

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const { condition } = parseFilterState(EXPORT_SPEC, sp);
  const rows = await inquiriesService.listForExport(condition);

  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(rows.map(inquiryRowToExcelRecord), { header: [...EXPORT_COLUMNS] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Inquiries");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const dateIso = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inquiries-${dateIso}.xlsx"`,
    },
  });
});
