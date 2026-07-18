import { filesService } from "@/lib/files";

// Product images are always resourceType "static" (see db/schema/files.ts) —
// no secured/ak-token access path needed, so this just serves the object.
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = key.join("/");
  try {
    const obj = await filesService().get(path);
    return new Response(Buffer.from(obj.body), {
      status: 200,
      headers: {
        "Content-Type": obj.contentType ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
