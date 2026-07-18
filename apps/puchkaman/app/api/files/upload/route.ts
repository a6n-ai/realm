import { nanoid } from "nanoid";
import { handler, problem } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { filesService } from "@/lib/files";
import { sanitizeFilename, validateUpload } from "./validate";

export const POST = handler(async (request: Request): Promise<Response> => {
  await requireAdmin();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return problem(400, "No file provided");
  const err = validateUpload({ type: file.type, size: file.size });
  if (err) return problem(400, err);
  const prefix = sanitizeFilename(String(form.get("prefix") ?? "uploads")) || "uploads";
  const key = `${prefix}/${nanoid()}/${sanitizeFilename(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detail = await filesService().create(key, bytes, { contentType: file.type });
  return Response.json(detail, { status: 200 });
});
