// Which requests get markdown. No imports: proxy.ts uses it, and the proxy must stay light.

/** Public pages that have a markdown version. Any other path keeps its HTML. */
export const MD_PAGES = new Set(["/", "/pricing", "/faq", "/locations"]);

/** True when the Accept header lists text/markdown with a non-zero weight. */
export function wantsMarkdown(accept: string | null): boolean {
  return (accept ?? "").split(",").some((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(";");
    if (type?.trim() !== "text/markdown") return false;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return !q || Number(q.slice(2)) > 0;
  });
}
