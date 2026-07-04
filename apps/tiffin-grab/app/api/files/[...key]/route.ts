import { filesService } from "@/lib/files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
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
