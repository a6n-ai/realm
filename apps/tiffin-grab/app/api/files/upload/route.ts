import { nanoid } from "nanoid";
import { requireStaff } from "@/lib/auth/guards";
import { filesService } from "@/lib/files";
import { sanitizeFilename, validateUpload } from "./validate";

export async function POST(request: Request): Promise<Response> {
  await requireStaff();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const err = validateUpload({ type: file.type, size: file.size });
  if (err) return Response.json({ error: err }, { status: 400 });

  const prefix = sanitizeFilename(String(form.get("prefix") ?? "uploads")) || "uploads";
  const key = `${prefix}/${nanoid()}/${sanitizeFilename(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const detail = await filesService().create(key, bytes, { contentType: file.type });
  return Response.json(detail, { status: 200 });
}
