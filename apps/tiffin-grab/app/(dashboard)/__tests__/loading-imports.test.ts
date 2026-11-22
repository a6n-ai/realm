import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
// Loading renders before any data loads: a DB, service or auth-guard module on its import path drags server code into the skeleton.
const FORBIDDEN = /db\/|\.service|lib\/auth\/guards/;
// `import type` is erased at build time, so it cannot pull a module in.
const SPEC = /^\s*(?:import|export)\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm;
const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const LOADING = ["app/(dashboard)/dashboard/customers/(index)/loading.tsx", "app/(dashboard)/dashboard/customer-groups/(index)/loading.tsx"];
const DEPTH = 2;

function imports(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(SPEC)].map((m) => m[1]);
}

function resolveSpec(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  return EXTS.map((e) => base + e).find((p) => existsSync(p) && statSync(p).isFile()) ?? null;
}

describe("customers and customer-groups loading.tsx", () => {
  it("reach no DB, service or auth-guard module within two import hops", () => {
    const hits: string[] = [];
    for (const rel of LOADING) {
      let frontier = [join(ROOT, rel)];
      const seen = new Set(frontier);
      for (let depth = 0; depth <= DEPTH; depth++) {
        const next: string[] = [];
        for (const file of frontier) {
          for (const spec of imports(file)) {
            if (FORBIDDEN.test(spec)) hits.push(`${rel} -> ${file.slice(ROOT.length + 1)} imports ${spec}`);
            const local = resolveSpec(spec, file);
            if (local && !seen.has(local)) {
              seen.add(local);
              next.push(local);
            }
          }
        }
        frontier = next;
      }
    }
    expect(hits).toEqual([]);
  });
});
