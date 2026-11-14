import { handler, problem } from "@foundry/routes";
import { requireStaff } from "@/lib/auth/guards";
import { filesService } from "@/lib/files";
import { readImageUpload, sanitizeFilename, uploadKey } from "@/lib/files/upload";

export const POST = handler(async (request: Request): Promise<Response> => {
  await requireStaff();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return problem(400, "No file provided");
  }

  const image = await readImageUpload(file);
  if ("error" in image) return problem(400, image.error);

  const prefix = sanitizeFilename(String(form.get("prefix") ?? "uploads")) || "uploads";
  const detail = await filesService().create(uploadKey(prefix, file.name), image.bytes, { contentType: image.type });
  return Response.json(detail, { status: 200 });
});
