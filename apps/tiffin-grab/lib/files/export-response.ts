const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const attachment = (filename: string) => `attachment; filename="${filename}"`;

export async function xlsxResponse(filename: string, sheet: { name: string; headers: string[]; records: Record<string, unknown>[] }): Promise<Response> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheet.records, { header: sheet.headers }), sheet.name);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": attachment(filename) } });
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": attachment(filename) } });
}
