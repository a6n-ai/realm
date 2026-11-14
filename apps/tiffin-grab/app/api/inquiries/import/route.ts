import { handler, problem } from "@foundry/routes";
import { phoneSchema, emailSchema, ValidationError } from "@foundry/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
import { inquiriesService } from "@/lib/inquiries/inquiries.service";
import { loadLeadSourceAliases } from "@/lib/inquiries/lead-sources.service";
import { STAGE_MAP, type ImportMapping } from "@/lib/inquiries/import-columns";

type RawRow = Record<string, unknown>;

function cell(row: RawRow, header: string | undefined): string {
  if (!header) return "";
  const v = row[header];
  if (v == null) return "";
  return String(v).trim();
}

// Excel date cells arrive as JS Date (xlsx cellDates:true); plain-text date columns
// arrive as strings. Accept either; reject anything that doesn't produce a real date.
function parseDate(v: unknown): number | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v.trim());
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date (days since 1899-12-30), in case cellDates parsing missed it.
    const epoch = Math.round((v - 25569) * 86400 * 1000);
    return isNaN(epoch) ? null : epoch;
  }
  return null;
}

type RowResult =
  | { row: number; outcome: "created" | "matched" | "reopened"; publicId: string; warnings: string[] }
  | { row: number; outcome: "error"; message: string };

export const POST = handler(async (request: Request): Promise<Response> => {
  await requireStaff();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return problem(400, "No file provided");
  const sheetName = String(form.get("sheet") ?? "");
  if (!sheetName) return problem(400, "No worksheet selected");
  const defaultSourceKeyInput = String(form.get("defaultSourceKey") ?? "manual").trim() || "manual";

  let mapping: ImportMapping;
  try {
    mapping = JSON.parse(String(form.get("mapping") ?? "{}"));
  } catch {
    return problem(400, "Invalid column mapping");
  }
  if (!mapping.date || (!mapping.phone && !mapping.fullName)) {
    return problem(400, "Map Date and at least one of Full Name or Phone Number before importing");
  }

  const XLSX = await import("xlsx");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return problem(400, `Worksheet "${sheetName}" not found in the uploaded file`);
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  if (rows.length === 0) return problem(400, "The selected worksheet has no data rows");

  const { defaultCountry } = await getAppSettings();

  const { sourceByAlias, subByParentAndAlias } = await loadLeadSourceAliases();
  const defaultSourceKey = sourceByAlias.get(defaultSourceKeyInput.toLowerCase()) ?? "manual";

  const results: RowResult[] = [];

  // Sequential, not parallel: createOrFold's dedup relies on a read-then-write
  // check per (phone, source) pair — the same reason the pipeline's own create path
  // isn't batched. A large sheet just takes longer, not less correct.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = i + 2; // header is row 1
    try {
      const rawPhone = cell(row, mapping.phone);
      const dateVal = mapping.date ? row[mapping.date] : undefined;
      const rawFullName = cell(row, mapping.fullName);
      if (!rawPhone && !rawFullName) throw new ValidationError("Skipped: row has neither a name nor a phone number");
      const dateMs = parseDate(dateVal);
      if (dateMs == null) throw new ValidationError("Date is missing or unreadable");

      let phone: string | undefined;
      if (rawPhone) {
        const parsedPhone = phoneSchema(defaultCountry).safeParse(rawPhone);
        if (!parsedPhone.success) throw new ValidationError(`Invalid phone number: ${rawPhone}`);
        phone = parsedPhone.data;
      }

      const rawWhatsapp = cell(row, mapping.whatsappPhone);
      let whatsappPhone: string | undefined;
      if (rawWhatsapp) {
        const parsedWa = phoneSchema(defaultCountry).safeParse(rawWhatsapp);
        if (!parsedWa.success) throw new ValidationError(`Invalid WhatsApp number: ${rawWhatsapp}`);
        whatsappPhone = parsedWa.data;
      }

      const warnings: string[] = [];

      const rawSource = cell(row, mapping.source);
      const sourceKey = rawSource
        ? (sourceByAlias.get(rawSource.toLowerCase()) ??
          (warnings.push(`Unknown source "${rawSource}" — used default`), defaultSourceKey))
        : defaultSourceKey;

      const rawSubSource = cell(row, mapping.subSource);
      const subSourceKey = rawSubSource
        ? subByParentAndAlias.get(sourceKey)?.get(rawSubSource.toLowerCase())
        : undefined;

      const rawEmail = cell(row, mapping.email);
      let email: string | undefined;
      if (rawEmail) {
        const parsedEmail = emailSchema.safeParse(rawEmail);
        if (!parsedEmail.success) throw new ValidationError(`Invalid email: ${rawEmail}`);
        email = parsedEmail.data;
      }

      const notes =
        (mapping.notes ?? [])
          .map((header) => {
            const v = cell(row, header);
            return v ? `${header}: ${v}` : "";
          })
          .filter(Boolean)
          .join("\n") || undefined;

      // Same person (phone, WhatsApp or email, any stage) folds into their row; a lost one reopens.
      const { inquiry, outcome } = await inquiriesService.createOrFold({
        fullName: rawFullName || undefined,
        phone,
        whatsappPhone,
        ...(email ? { email } : {}),
        sourceKey,
        subSourceKey,
        notes,
        // Managed field: createOrFold applies it after insert, only for a new row — the sanctioned
        // bypass of stripManaged so imported history keeps its original date.
      }, { createdAt: dateMs });
      const publicId = inquiry.publicId;

      const rawStage = cell(row, mapping.stage);
      const normalizedStage = rawStage.toLowerCase().trim();
      const mappedStage = normalizedStage ? STAGE_MAP[normalizedStage] : undefined;
      if (rawStage && !mappedStage) warnings.push(`Unrecognized stage "${rawStage}" — left as New`);
      const currentStage = inquiry.stage;
      const targetStage = mappedStage ?? "new";
      // An open lead cannot go back to New and conversion happens via convert, so neither is applied here.
      // A folded row keeps the stage staff already gave it.
      if (outcome !== "folded" && targetStage !== currentStage && targetStage !== "new" && targetStage !== "converted") {
        if (targetStage === "lost") {
          try {
            await inquiriesService.markLost(publicId, "other", notes);
          } catch (e) {
            warnings.push(e instanceof Error ? e.message : "Could not mark as lost");
          }
        } else {
          await inquiriesService.changeStage(publicId, targetStage);
        }
      }

      const followUpMs = mapping.followUpDate ? parseDate(row[mapping.followUpDate]) : null;
      if (followUpMs != null) {
        await inquiriesService.logActivity(publicId, {
          type: "callback",
          nextFollowUpAt: followUpMs,
          note: notes,
        });
      }

      results.push({ row: excelRow, outcome: outcome === "folded" ? "matched" : outcome, publicId, warnings });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      results.push({ row: excelRow, outcome: "error", message });
    }
  }

  const created = results.filter((r) => r.outcome === "created").length;
  const matched = results.filter((r) => r.outcome === "matched").length;
  const reopened = results.filter((r) => r.outcome === "reopened").length;
  const errors = results.filter((r) => r.outcome === "error") as Extract<RowResult, { outcome: "error" }>[];
  const warnings = results.flatMap((r) =>
    r.outcome !== "error" && r.warnings.length ? r.warnings.map((w) => ({ row: r.row, message: w })) : [],
  );

  return Response.json({
    totalRows: rows.length,
    created,
    matched,
    reopened,
    errors,
    warnings,
  });
});
