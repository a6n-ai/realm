// Which requests get markdown. Imports only the pure page list: proxy.ts uses it, and the proxy must stay light.
import { PUBLIC_PAGES } from "@/lib/routing/public-pages";

/** Public pages that have a markdown version. Any other path keeps its HTML. */
export const MD_PAGES = new Set(PUBLIC_PAGES.filter((p) => p.markdown).map((p) => p.path));

/** True when the Accept header lists text/markdown with a non-zero weight. */
export function wantsMarkdown(accept: string | null): boolean {
  return (accept ?? "").split(",").some((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(";");
    if (type?.trim() !== "text/markdown") return false;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return !q || Number(q.slice(2)) > 0;
  });
}
