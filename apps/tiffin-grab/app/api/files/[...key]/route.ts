import { filesSecuredAccess, filesService, isSecured } from "@/lib/files";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key } = await params;
  const path = key.join("/");

  const secured = await isSecured(path);

  if (secured) {
    const ak = new URL(request.url).searchParams.get("ak");
    const result = ak ? await filesSecuredAccess.validate(ak, path) : ({ ok: false } as const);
    if (!result.ok) return new Response("Forbidden", { status: 403 });
  }

  try {
    const obj = await filesService().get(path);
    return new Response(obj.body as BodyInit, {
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
