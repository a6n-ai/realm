import { eq } from "drizzle-orm";
import { handler, problem } from "@realm/routes";
import { phoneSchema, emailSchema, ValidationError } from "@realm/commons";
import { db } from "@/db/client";
import { inquiries, leadSources, leadSubsources } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { STAGE_MAP, type ImportMapping } from "@/app/(dashboard)/dashboard/inquiries/import/inquiry-import-columns";

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
  | { row: number; outcome: "created" | "matched"; publicId: string; warnings: string[] }
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
  if (!mapping.date || !mapping.phone) {
    return problem(400, "Map both Date and Phone Number before importing");
  }

  const XLSX = await import("xlsx");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return problem(400, `Worksheet "${sheetName}" not found in the uploaded file`);
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  if (rows.length === 0) return problem(400, "The selected worksheet has no data rows");

  const { defaultCountry } = await getAppSettings();

  // Loaded once: case-insensitive key/label -> canonical key lookups, scoped so a
  // subsource only resolves within its own parent source.
  const sourceRows = await db
    .select({ key: leadSources.key, label: leadSources.label })
    .from(leadSources);
  const subRows = await db
    .select({ key: leadSubsources.key, label: leadSubsources.label, parentKey: leadSources.key })
    .from(leadSubsources)
    .innerJoin(leadSources, eq(leadSubsources.sourceId, leadSources.id));
  const sourceByAlias = new Map<string, string>();
  for (const s of sourceRows) {
    sourceByAlias.set(s.key.toLowerCase(), s.key);
    sourceByAlias.set(s.label.toLowerCase(), s.key);
  }
  const defaultSourceKey = sourceByAlias.get(defaultSourceKeyInput.toLowerCase()) ?? "manual";
  const subByParentAndAlias = new Map<string, Map<string, string>>();
  for (const s of subRows) {
    const m = subByParentAndAlias.get(s.parentKey) ?? new Map<string, string>();
    m.set(s.key.toLowerCase(), s.key);
    m.set(s.label.toLowerCase(), s.key);
    subByParentAndAlias.set(s.parentKey, m);
  }

  const results: RowResult[] = [];

  // Sequential, not parallel: resolveForSource's dedup relies on a read-then-write
  // check per (phone, source) pair — the same reason the pipeline's own create path
  // isn't batched. A large sheet just takes longer, not less correct.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = i + 2; // header is row 1
    try {
      const rawPhone = cell(row, mapping.phone);
      const dateVal = mapping.date ? row[mapping.date] : undefined;
      if (!rawPhone) throw new ValidationError("Phone Number is required");
      const dateMs = parseDate(dateVal);
      if (dateMs == null) throw new ValidationError("Date is missing or unreadable");

      const parsedPhone = phoneSchema(defaultCountry).safeParse(rawPhone);
      if (!parsedPhone.success) throw new ValidationError(`Invalid phone number: ${rawPhone}`);
      const phone = parsedPhone.data;

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

      const rawFullName = cell(row, mapping.fullName);
      const fullName = rawFullName || `Lead ${phone}`;

      const rawEmail = cell(row, mapping.email);
      const emailCandidate = rawEmail || `${phone.replace(/[^0-9]/g, "")}@no-reply.tiffingrab.internal`;
      const parsedEmail = emailSchema.safeParse(emailCandidate);
      if (!parsedEmail.success) throw new ValidationError(`Invalid email: ${rawEmail}`);

      const notes =
        (mapping.notes ?? [])
          .map((header) => {
            const v = cell(row, header);
            return v ? `${header}: ${v}` : "";
          })
          .filter(Boolean)
          .join("\n") || undefined;

      const existingOpen = (await inquiriesService.findOpenByPhone(phone)).find(
        (o) => o.sourceKey === sourceKey,
      );

      const publicId = await inquiriesService.resolveForSource({
        phone,
        sourceKey,
        contact: { fullName, email: parsedEmail.data },
        interest: { subSourceKey, notes },
      });

      const isNew = !existingOpen;
      if (isNew) {
        // resolveForSource/create always stamp createdAt as "now" (a managed field,
        // stripped from client input) — for a bulk historical import that's wrong,
        // so backdate it directly once, only for rows that just created a fresh row.
        await db.update(inquiries).set({ createdAt: dateMs }).where(eq(inquiries.publicId, publicId));
      }

      const rawStage = cell(row, mapping.stage);
      const normalizedStage = rawStage.toLowerCase().trim();
      const mappedStage = normalizedStage ? STAGE_MAP[normalizedStage] : undefined;
      if (rawStage && !mappedStage) warnings.push(`Unrecognized stage "${rawStage}" — left as New`);
      const currentStage = existingOpen?.stage ?? "new";
      const targetStage = mappedStage ?? "new";
      if (targetStage !== currentStage) {
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

      results.push({ row: excelRow, outcome: isNew ? "created" : "matched", publicId, warnings });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      results.push({ row: excelRow, outcome: "error", message });
    }
  }

  const created = results.filter((r) => r.outcome === "created").length;
  const matched = results.filter((r) => r.outcome === "matched").length;
  const errors = results.filter((r) => r.outcome === "error") as Extract<RowResult, { outcome: "error" }>[];
  const warnings = results.flatMap((r) =>
    r.outcome !== "error" && r.warnings.length ? r.warnings.map((w) => ({ row: r.row, message: w })) : [],
  );

  return Response.json({
    totalRows: rows.length,
    created,
    matched,
    errors,
    warnings,
  });
});
