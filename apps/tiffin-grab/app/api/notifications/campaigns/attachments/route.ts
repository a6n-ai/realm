import { nanoid } from "nanoid";
import { handler, problem } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { filesService } from "@/lib/files";
import { sanitizeFilename } from "@/app/api/files/upload/validate";

// Deliberately separate from /api/files/upload's image-only allowlist — a
// campaign attachment is admin-only and reasonably needs PDFs/docs/sheets,
// which that endpoint intentionally never accepts.
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]);
const MAX_BYTES = 10 * 1024 * 1024;

export const POST = handler(async (request: Request): Promise<Response> => {
  await requireAdmin();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return problem(400, "No file provided");
  if (!ALLOWED_TYPES.has(file.type)) return problem(400, "That file type isn't allowed as an attachment");
  if (file.size > MAX_BYTES) return problem(400, "Attachment must be 10MB or smaller");

  const key = `campaign-attachments/${nanoid()}/${sanitizeFilename(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detail = await filesService().create(key, bytes, { contentType: file.type });
  return Response.json(detail, { status: 200 });
});
