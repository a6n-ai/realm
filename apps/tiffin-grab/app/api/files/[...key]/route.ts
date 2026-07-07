import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fileSystem } from "@/db/schema";
import { filesSecuredAccess, filesService } from "@/lib/files";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key } = await params;
  const path = key.join("/");

  const [row] = await db
    .select({ resourceType: fileSystem.resourceType })
    .from(fileSystem)
    .where(eq(fileSystem.path, path))
    .limit(1);
  const secured = row?.resourceType === "secured";

  if (secured) {
    const ak = new URL(request.url).searchParams.get("ak");
    const result = ak ? await filesSecuredAccess.validate(ak, path) : ({ ok: false } as const);
    if (!result.ok) return new Response("Forbidden", { status: 403 });
  }

  try {
    const obj = await filesService().get(path);
    return new Response(Buffer.from(obj.body), {
      status: 200,
      headers: {
        "Content-Type": obj.contentType ?? "application/octet-stream",
        "Cache-Control": secured ? "private, no-store" : "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
