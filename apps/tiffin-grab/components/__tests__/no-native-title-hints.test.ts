import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const { parse } = createRequire(import.meta.url)("next/dist/compiled/babel/parser") as {
  parse: (code: string, options: { sourceType: "module"; plugins: string[] }) => { program: unknown };
};

const APPS = fileURLToPath(new URL("../../..", import.meta.url));
const SWEPT = [
  "tiffin-grab/app/(dashboard)",
  "tiffin-grab/components",
  "xplorers/app/(dashboard)",
  "xplorers/components",
].map((d) => resolve(APPS, d));

const SKIPPED_DIRS = new Set(["kit", "customer", "marketing", "wizard", "__tests__", "node_modules"]);
const EXEMPT_TAGS = new Set(["iframe", "abbr"]);

/** Each entry is an intentional native title on a swept line; keep this empty unless a native hint is the right call. */
const ALLOWLIST: { file: string; snippet: string; reason: string }[] = [];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

type Visitable = { type?: unknown; [key: string]: unknown };

function forEachNode(node: unknown, visit: (n: Visitable) => void): void {
  if (Array.isArray(node)) return node.forEach((child) => forEachNode(child, visit));
  if (!node || typeof node !== "object") return;
  const n = node as Visitable;
  if (typeof n.type === "string") visit(n);
  for (const [key, value] of Object.entries(n)) {
    if (key === "loc" || key === "extra" || key.endsWith("omments") || key === "tokens") continue;
    forEachNode(value, visit);
  }
}

/** Flags a `title` on an intrinsic (lowercase) JSX tag, so a multi-line tag is caught too. */
export function nativeTitleHints(dirs: string[]): string[] {
  return dirs.flatMap(sourceFiles).flatMap((file) => {
    const ast = parse(readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx", "typescript"] });
    const hits: string[] = [];
    forEachNode(ast.program, (node) => {
      if (node.type !== "JSXOpeningElement") return;
      const name = node.name as { type: string; name: string };
      if (name.type !== "JSXIdentifier" || !/^[a-z]/.test(name.name) || EXEMPT_TAGS.has(name.name)) return;
      const hasTitle = (node.attributes as { type: string; name?: { name?: string } }[]).some(
        (a) => a.type === "JSXAttribute" && a.name?.name === "title",
      );
      if (!hasTitle) return;
      const line = (node.loc as { start: { line: number } }).start.line;
      hits.push(`${relative(APPS, file)}:${line} <${name.name} title>`);
    });
    return hits;
  }).filter((hit) => !ALLOWLIST.some((a) => hit.startsWith(a.file) && hit.includes(a.snippet)));
}

const TOOLTIP_WRAPPERS = new Set(["HoverHint", "Tooltip", "TooltipTrigger"]);
const TABLE_PARTS = new Set(["TableCell", "TableRow", "TableHead"]);

function jsxName(node: unknown): string | null {
  const name = (node as { name?: { type: string; name: string } }).name;
  return name?.type === "JSXIdentifier" ? name.name : null;
}

/** A tooltip wrapper renders its content as a sibling of its child, so a table part inside one puts a div between cells. */
export function tableWrappedInTooltip(dirs: string[]): string[] {
  return dirs.flatMap(sourceFiles).flatMap((file) => {
    const ast = parse(readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx", "typescript"] });
    const hits: string[] = [];
    forEachNode(ast.program, (node) => {
      if (node.type !== "JSXElement") return;
      const wrapper = jsxName((node as { openingElement: unknown }).openingElement);
      if (!wrapper || !TOOLTIP_WRAPPERS.has(wrapper)) return;
      const children = (node.children as { type: string; openingElement?: unknown }[]).filter((c) => c.type === "JSXElement");
      const part = children.map((c) => jsxName(c.openingElement)).find((n) => n && TABLE_PARTS.has(n));
      if (!part) return;
      const line = ((node.loc as { start: { line: number } }).start.line);
      hits.push(`${relative(APPS, file)}:${line} <${wrapper}> wraps <${part}>`);
    });
    return hits;
  });
}

describe("admin hover hints", () => {
  it("use the ui Tooltip, not a native title attribute", () => {
    expect(nativeTitleHints(SWEPT)).toEqual([]);
  });

  it("never wrap a table part in a tooltip wrapper", () => {
    expect(tableWrappedInTooltip(SWEPT)).toEqual([]);
  });

  it("flags a tooltip wrapper whose direct child is a table part, and nothing else", () => {
    const dir = mkdtempSync(join(tmpdir(), "tooltip-table-"));
    writeFileSync(
      join(dir, "fixture.tsx"),
      [
        'export const a = <HoverHint text="x"><TableCell>x</TableCell></HoverHint>;',
        'export const b = <Tooltip><TableRow /></Tooltip>;',
        'export const c = <HoverHint text="x"><span><TableCell>x</TableCell></span></HoverHint>;',
        'export const d = <TableCell><HoverHint text="x"><span>x</span></HoverHint></TableCell>;',
      ].join("\n"),
    );
    const hits = tableWrappedInTooltip([dir]);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatch(/:1 <HoverHint> wraps <TableCell>$/);
    expect(hits[1]).toMatch(/:2 <Tooltip> wraps <TableRow>$/);
  });

  it("catches intrinsic tags with a title, including multi-line tags, and skips components and exempt tags", () => {
    const dir = mkdtempSync(join(tmpdir(), "native-title-"));
    writeFileSync(
      join(dir, "fixture.tsx"),
      [
        "export const a = (<button",
        '  type="button"',
        '  title="multi line">x</button>);',
        'export const b = <span title="self" />;',
        'export const c = <Link title="component">x</Link>;',
        'export const d = <abbr title="exempt">x</abbr>;',
        'export const e = <Dialog title="heading" />;',
      ].join("\n"),
    );
    const hits = nativeTitleHints([dir]);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatch(/:1 <button title>$/);
    expect(hits[1]).toMatch(/:4 <span title>$/);
  });
});
