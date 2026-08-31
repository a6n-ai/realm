// Client-side code prettifier for the template editor's HTML and React modes.
// Lazy-loads prettier's *standalone* build + parser plugins so the ~1MB of
// parsers stay out of the main bundle (same trick react-template.ts uses for
// sucrase). The normal `prettier` import pulls Node's fs and won't run here.
import type { Plugin } from "prettier";

const asPlugin = (m: unknown) => (m as { default?: Plugin }).default ?? (m as Plugin);

export async function formatCode(source: string, lang: "html" | "react"): Promise<string> {
  const prettier = await import("prettier/standalone");
  if (lang === "html") {
    const html = await import("prettier/plugins/html");
    return prettier.format(source, { parser: "html", plugins: [asPlugin(html)], printWidth: 100 });
  }
  // babel-ts parses TSX; estree prints it. No separate typescript plugin needed.
  const [babel, estree] = await Promise.all([
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
  ]);
  return prettier.format(source, {
    parser: "babel-ts",
    plugins: [asPlugin(babel), asPlugin(estree)],
    printWidth: 80,
  });
}
