import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FORBIDDEN = [/["']next\/headers["']/, /["']@\/lib\/tenant\/resolve-request-org["']/, /["']@\/lib\/auth\/session["']/, /\bgetSession\b/];
const SPEC = /(?:from|import)\s*\(?\s*["']([^"']+)["']|export\s[^"']*?from\s*["']([^"']+)["']/g;
const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/__tests__|\.test\./.test(p) ? [p] : [];
  });
}

function resolveSpec(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(APP, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  return EXTS.map((e) => base + e).find((p) => existsSync(p) && statSync(p).isFile()) ?? null;
}

// ISR pages must not read request APIs: a headers()/session read would cache one visitor's view for all.
describe("app/site", () => {
  it("no module reachable from app/site imports request APIs", () => {
    const parent = new Map<string, string | null>();
    const queue = walk(join(APP, "app/site")).map((f) => (parent.set(f, null), f));
    const hits: string[] = [];
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      const src = readFileSync(file, "utf8");
      // A server action runs per call, never during the cached render, so it is out of scope entirely.
      if (/^\s*["']use server["']/.test(src)) continue;
      if (FORBIDDEN.some((re) => re.test(src))) {
        const chain: string[] = [];
        for (let f: string | null | undefined = file; f; f = parent.get(f)) chain.unshift(f.slice(APP.length + 1));
        hits.push(chain.join(" -> "));
      }
      // Services are leaves: they share helpers with the dashboard and the graph below them cannot say
      // which function a page calls. At runtime `dynamic = "error"` makes headers() throw, and the callers
      // that swallow errors rethrow it (lib/next-bailout.ts).
      if (file.includes("/lib/services/")) continue;
      for (const m of src.matchAll(SPEC)) {
        const target = resolveSpec(m[1] ?? m[2], file);
        if (target && !target.includes("node_modules") && !parent.has(target)) {
          parent.set(target, file);
          queue.push(target);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
