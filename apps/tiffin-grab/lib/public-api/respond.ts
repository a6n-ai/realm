const CACHE = "public, max-age=300, s-maxage=300, stale-while-revalidate=3600";

export function publicJson(body: unknown, init: { status?: number; type?: string; cache?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": init.type ?? "application/json; charset=utf-8", "cache-control": init.cache ?? CACHE, "access-control-allow-origin": "*" },
  });
}

export const publicError = (status: number, message: string) => publicJson({ error: message }, { status, cache: "no-store" });
