# Tiffin Grab — Foundation (Subsystem A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Turborepo + pnpm monorepo with three reusable packages (`@tiffin/commons`, `@tiffin/commons-drizzle`, `@tiffin/commons-next`) and Postgres+Drizzle wiring, proven end-to-end by a working `feature_flags` REST resource.

**Architecture:** Move the existing Next.js 16 app to `apps/web`. Three source-only TS packages (transpiled by Next/Vitest, no build step) mirror the reference jOOQ layering: DB-agnostic `commons` → Drizzle persistence `commons-drizzle` → App-Router controller `commons-next`. The full stack is exercised against one real table (`feature_flags`) so every layer has a passing test.

**Tech Stack:** Turborepo 2.9 + pnpm (via corepack), Next.js 16, TypeScript 5, Drizzle ORM 0.45 + drizzle-kit 0.31, `postgres` 3.4 driver, PostgreSQL 16 (Docker for dev), Vitest 4.1.

## Global Constraints

- Next.js 16 App Router. Route protection uses `proxy.ts` (NOT `middleware.ts`) — Plan 2 concern; do not add a middleware file.
- Read `node_modules/next/dist/docs/` before writing any framework-specific code (per `AGENTS.md`).
- TypeScript everywhere. No unnecessary comments — document the non-obvious *why* only.
- Use `rg`/`fd` over `grep`/`find` in any tooling.
- Packages are **source-only**: `exports`/`types` point at `src/index.ts`; the Next app lists them in `transpilePackages`. No per-package build step.
- Package names: `@tiffin/commons`, `@tiffin/commons-drizzle`, `@tiffin/commons-next`. Internal deps use `workspace:*`.
- Every table uses `baseColumns` (immutable) or `updatableColumns` (updatable) from `@tiffin/commons-drizzle`. PKs are uuid v4.
- Pricing/audit constraints belong to later plans; this plan only builds infra + the `feature_flags` resource.

---

### Task 1: Monorepo scaffold + relocate app to `apps/web`

**Files:**
- Create: `pnpm-workspace.yaml`, `turbo.json`, root `package.json` (replace), root `tsconfig.base.json`, `.npmrc`
- Move: existing app files → `apps/web/` (`app/`, `components/`, `lib/`, `public/`, `components.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `tsconfig.json`, `next-env.d.ts`, `app`-level configs, `package.json` → `apps/web/package.json`)
- Keep at root: `.git`, `.gitignore`, `PROJECT.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/`, `.mcp.json`

**Interfaces:**
- Produces: workspace where `pnpm install` links packages; `pnpm --filter web dev` boots the app; `apps/web` is the Next root.

- [ ] **Step 1: Enable pnpm and create the workspace manifest**

Run:
```bash
corepack enable
corepack prepare pnpm@9 --activate
pnpm -v
```

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `.npmrc`:
```
auto-install-peers=true
```

- [ ] **Step 2: Relocate the app into `apps/web`**

Run:
```bash
mkdir -p apps/web
git mv app components lib public components.json next.config.ts postcss.config.mjs eslint.config.mjs tsconfig.json next-env.d.ts package.json package-lock.json apps/web/ 2>/dev/null || true
# any remaining app-owned dotfiles
git mv .next apps/web/ 2>/dev/null || true
rm -f apps/web/package-lock.json
ls apps/web
```
Expected: `app components.json lib next.config.ts package.json public ...` listed under `apps/web`.

- [ ] **Step 3: Rewrite `apps/web/package.json` as a workspace member**

Replace `apps/web/package.json` with (preserve existing dependency versions already present; add `transpilePackages` deps and the three workspace packages):
```json
{
  "name": "web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tiffin/commons": "workspace:*",
    "@tiffin/commons-drizzle": "workspace:*",
    "@tiffin/commons-next": "workspace:*",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "drizzle-orm": "^0.45.2",
    "lucide-react": "^1.20.0",
    "next": "16.2.9",
    "postgres": "^3.4.9",
    "radix-ui": "^1.6.0",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "tailwind-merge": "^3.6.0",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "drizzle-kit": "^0.31.10",
    "eslint": "^9",
    "eslint-config-next": "16.2.9",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 4: Add `transpilePackages` to `apps/web/next.config.ts`**

Edit `apps/web/next.config.ts` so the config object includes:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tiffin/commons", "@tiffin/commons-drizzle", "@tiffin/commons-next"],
};

export default nextConfig;
```

- [ ] **Step 5: Create root `package.json`, `turbo.json`, `tsconfig.base.json`**

Create root `package.json`:
```json
{
  "name": "tiffin-grab",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^2.9.18",
    "typescript": "^5",
    "vitest": "^4.1.9"
  }
}
```

Create `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^typecheck"] },
    "test": {},
    "dev": { "cache": false, "persistent": true }
  }
}
```

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 6: Install and verify the app still boots**

Run:
```bash
pnpm install
pnpm --filter web exec next build
```
Expected: install completes, links `@tiffin/*` (they don't exist yet — install will warn; create empty stubs if it errors by running the next task first). `next build` compiles the relocated app.

> If `pnpm install` fails on the missing `@tiffin/*` workspace deps, create the three package.json stubs from Tasks 2–4 first, then re-run. The stubs are minimal `{"name": "...", "version": "0.0.0"}` files.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Turborepo+pnpm monorepo, relocate app to apps/web"
```

---

### Task 2: `@tiffin/commons` — DB-agnostic primitives

**Files:**
- Create: `packages/commons/package.json`, `packages/commons/tsconfig.json`, `packages/commons/vitest.config.ts`
- Create: `packages/commons/src/model/dto.ts`, `src/model/condition.ts`, `src/errors.ts`, `src/enums.ts`, `src/util/pagination.ts`, `src/util/code.ts`, `src/index.ts`
- Test: `packages/commons/src/model/condition.test.ts`, `src/util/code.test.ts`, `src/errors.test.ts`

**Interfaces:**
- Produces:
  - `BaseDTO = { id: string; createdAt: Date; createdBy: string | null }`
  - `UpdatableDTO = BaseDTO & { updatedAt: Date; updatedBy: string | null }`
  - `FilterOperator` enum: `"eq" | "in" | "like" | "gt" | "gte" | "lt" | "lte" | "between"`
  - `FilterCondition = { type: "filter"; field: string; operator: FilterOperator; value: unknown }`
  - `ComplexCondition = { type: "complex"; operator: "and" | "or"; conditions: Condition[] }`
  - `Condition = FilterCondition | ComplexCondition`
  - builders: `eq(field, value)`, `inList(field, values)`, `like(field, value)`, `gt/gte/lt/lte(field, value)`, `between(field, a, b)`, `and(...conds)`, `or(...conds)`
  - `Role = { ADMIN: "admin"; MEMBER: "member"; USER: "user" }` (const) + `RoleValue` type
  - `Page<T> = { items: T[]; page: number; size: number; total: number }`, `PageRequest = { page: number; size: number; sort?: { field: string; dir: "asc" | "desc" } }`
  - `generateCode(prefix: string, length?: number): string` → e.g. `"SUB-7F3K"`
  - errors: `AppError` (with `.status`), `NotFoundError` (404), `ValidationError` (400), `AuthError` (401), `ForbiddenError` (403)

- [ ] **Step 1: Create package manifest and tsconfig**

`packages/commons/package.json`:
```json
{
  "name": "@tiffin/commons",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": { "typescript": "^5", "vitest": "^4.1.9" }
}
```

`packages/commons/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/commons/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 2: Write the failing tests**

`packages/commons/src/util/code.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { generateCode } from "./code";

describe("generateCode", () => {
  it("prefixes and pads to the requested length", () => {
    const code = generateCode("SUB", 4);
    expect(code).toMatch(/^SUB-[0-9A-Z]{4}$/);
  });
  it("produces distinct codes across calls", () => {
    const a = generateCode("SUB", 6);
    const b = generateCode("SUB", 6);
    expect(a).not.toEqual(b);
  });
});
```

`packages/commons/src/model/condition.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { and, between, eq, inList, or } from "./condition";

describe("condition builders", () => {
  it("builds a filter condition", () => {
    expect(eq("status", "active")).toEqual({ type: "filter", field: "status", operator: "eq", value: "active" });
  });
  it("builds a between condition with a tuple value", () => {
    expect(between("kcal", 500, 900)).toEqual({ type: "filter", field: "kcal", operator: "between", value: [500, 900] });
  });
  it("nests complex conditions", () => {
    const c = and(eq("role", "user"), or(inList("zone", ["A", "B"]), eq("active", true)));
    expect(c.type).toBe("complex");
    expect(c).toMatchObject({ operator: "and" });
    expect((c as any).conditions[1].operator).toBe("or");
  });
});
```

`packages/commons/src/errors.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { AuthError, NotFoundError, ValidationError } from "./errors";

describe("app errors", () => {
  it("carries an HTTP status", () => {
    expect(new NotFoundError("x").status).toBe(404);
    expect(new ValidationError("x").status).toBe(400);
    expect(new AuthError("x").status).toBe(401);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @tiffin/commons test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the modules**

`packages/commons/src/model/dto.ts`:
```ts
export interface BaseDTO {
  id: string;
  createdAt: Date;
  createdBy: string | null;
}

export interface UpdatableDTO extends BaseDTO {
  updatedAt: Date;
  updatedBy: string | null;
}
```

`packages/commons/src/model/condition.ts`:
```ts
export type FilterOperator = "eq" | "in" | "like" | "gt" | "gte" | "lt" | "lte" | "between";

export interface FilterCondition {
  type: "filter";
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export interface ComplexCondition {
  type: "complex";
  operator: "and" | "or";
  conditions: Condition[];
}

export type Condition = FilterCondition | ComplexCondition;

const filter = (field: string, operator: FilterOperator, value: unknown): FilterCondition => ({
  type: "filter",
  field,
  operator,
  value,
});

export const eq = (field: string, value: unknown) => filter(field, "eq", value);
export const inList = (field: string, values: unknown[]) => filter(field, "in", values);
export const like = (field: string, value: string) => filter(field, "like", value);
export const gt = (field: string, value: unknown) => filter(field, "gt", value);
export const gte = (field: string, value: unknown) => filter(field, "gte", value);
export const lt = (field: string, value: unknown) => filter(field, "lt", value);
export const lte = (field: string, value: unknown) => filter(field, "lte", value);
export const between = (field: string, a: unknown, b: unknown) => filter(field, "between", [a, b]);

export const and = (...conditions: Condition[]): ComplexCondition => ({ type: "complex", operator: "and", conditions });
export const or = (...conditions: Condition[]): ComplexCondition => ({ type: "complex", operator: "or", conditions });
```

`packages/commons/src/errors.ts`:
```ts
export class AppError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) { super(message, 400); }
}
export class AuthError extends AppError {
  constructor(message = "Unauthorized") { super(message, 401); }
}
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") { super(message, 403); }
}
export class NotFoundError extends AppError {
  constructor(message = "Not found") { super(message, 404); }
}
```

`packages/commons/src/enums.ts`:
```ts
export const Role = { ADMIN: "admin", MEMBER: "member", USER: "user" } as const;
export type RoleValue = (typeof Role)[keyof typeof Role];
```

`packages/commons/src/util/pagination.ts`:
```ts
export interface PageRequest {
  page: number;
  size: number;
  sort?: { field: string; dir: "asc" | "desc" };
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export const DEFAULT_PAGE: PageRequest = { page: 0, size: 10 };
```

`packages/commons/src/util/code.ts`:
```ts
import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O for legibility

export function generateCode(prefix: string, length = 4): string {
  const bytes = randomBytes(length);
  let body = "";
  for (let i = 0; i < length; i++) {
    body += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `${prefix}-${body}`;
}
```

`packages/commons/src/index.ts`:
```ts
export * from "./model/dto";
export * from "./model/condition";
export * from "./errors";
export * from "./enums";
export * from "./util/pagination";
export * from "./util/code";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @tiffin/commons test`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add packages/commons
git commit -m "feat(commons): DTO base, condition model, errors, enums, util"
```

---

### Task 3: `@tiffin/commons-drizzle` — columns, condition translator, repository, service

**Files:**
- Create: `packages/commons-drizzle/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/columns.ts`, `src/condition.ts`, `src/repository.ts`, `src/service.ts`, `src/types.ts`, `src/index.ts`
- Test: `src/condition.test.ts`

**Interfaces:**
- Consumes: `@tiffin/commons` `Condition`, `Page`, `PageRequest`.
- Produces:
  - `baseColumns` (`id`, `createdAt`, `createdBy`), `updatableColumns` (adds `updatedAt`, `updatedBy`) — Drizzle pg column builders.
  - `type Database` = `PostgresJsDatabase<Record<string, never>>`.
  - `toDrizzleWhere(table, condition?): SQL | undefined`.
  - `class BaseRepository<TTable extends PgTable>` — ctor `(db, table, idColumn)`; `create(values, actorId?)`, `findById(id)`, `findMany(condition?, page?)`, `delete(id)`.
  - `class UpdatableRepository<TTable> extends BaseRepository` — adds `update(id, patch, actorId?)`.
  - `class BaseService<TTable>` — ctor `(repo)`; `create`, `read`, `list`, `delete`; `protected currentUserId(): Promise<string | null>` (default null).
  - `class UpdatableService<TTable> extends BaseService` — adds `update`.

- [ ] **Step 1: Create manifest, tsconfig, vitest config**

`packages/commons-drizzle/package.json`:
```json
{
  "name": "@tiffin/commons-drizzle",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@tiffin/commons": "workspace:*" },
  "peerDependencies": { "drizzle-orm": "^0.45.2" },
  "devDependencies": { "drizzle-orm": "^0.45.2", "typescript": "^5", "vitest": "^4.1.9" }
}
```

`packages/commons-drizzle/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/commons-drizzle/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 2: Implement columns and types (no test — declarative builders)**

`packages/commons-drizzle/src/columns.ts`:
```ts
import { timestamp, uuid } from "drizzle-orm/pg-core";

export const baseColumns = {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
};

export const updatableColumns = {
  ...baseColumns,
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by"),
};
```

`packages/commons-drizzle/src/types.ts`:
```ts
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type Database = PostgresJsDatabase<Record<string, never>>;
```

- [ ] **Step 3: Write the failing condition-translator test**

`packages/commons-drizzle/src/condition.test.ts`:
```ts
import { and, between, eq, inList } from "@tiffin/commons";
import { sql } from "drizzle-orm";
import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { toDrizzleWhere } from "./condition";

const demo = pgTable("demo", {
  id: uuid("id").primaryKey(),
  status: text("status"),
  kcal: integer("kcal"),
});

const renderParams = (s: ReturnType<typeof toDrizzleWhere>) => {
  // toDrizzleWhere returns a Drizzle SQL chunk; assert it is produced, not undefined.
  return s;
};

describe("toDrizzleWhere", () => {
  it("returns undefined for no condition", () => {
    expect(toDrizzleWhere(demo, undefined)).toBeUndefined();
  });
  it("translates an eq filter to SQL", () => {
    const where = toDrizzleWhere(demo, eq("status", "active"));
    expect(where).toBeDefined();
    expect(renderParams(where)).not.toBeNull();
  });
  it("translates in/between/complex without throwing", () => {
    const where = toDrizzleWhere(demo, and(inList("status", ["a", "b"]), between("kcal", 500, 900)));
    expect(where).toBeDefined();
  });
  it("throws on an unknown field", () => {
    expect(() => toDrizzleWhere(demo, eq("nope", 1))).toThrow();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @tiffin/commons-drizzle test`
Expected: FAIL — `./condition` not found.

- [ ] **Step 5: Implement the condition translator**

`packages/commons-drizzle/src/condition.ts`:
```ts
import type { Condition } from "@tiffin/commons";
import {
  and as dAnd,
  between as dBetween,
  eq as dEq,
  gt as dGt,
  gte as dGte,
  inArray,
  like as dLike,
  lt as dLt,
  lte as dLte,
  or as dOr,
  type SQL,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

function column(table: PgTable, field: string): PgColumn {
  const col = (table as unknown as Record<string, PgColumn>)[field];
  if (!col) throw new Error(`Unknown field on ${String((table as any)[Symbol.for("drizzle:Name")])}: ${field}`);
  return col;
}

export function toDrizzleWhere(table: PgTable, condition?: Condition): SQL | undefined {
  if (!condition) return undefined;

  if (condition.type === "complex") {
    const parts = condition.conditions
      .map((c) => toDrizzleWhere(table, c))
      .filter((p): p is SQL => p !== undefined);
    if (parts.length === 0) return undefined;
    return condition.operator === "and" ? dAnd(...parts) : dOr(...parts);
  }

  const col = column(table, condition.field);
  const v = condition.value;
  switch (condition.operator) {
    case "eq": return dEq(col, v);
    case "in": return inArray(col, v as unknown[]);
    case "like": return dLike(col, v as string);
    case "gt": return dGt(col, v);
    case "gte": return dGte(col, v);
    case "lt": return dLt(col, v);
    case "lte": return dLte(col, v);
    case "between": {
      const [a, b] = v as [unknown, unknown];
      return dBetween(col, a, b);
    }
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @tiffin/commons-drizzle test`
Expected: PASS.

- [ ] **Step 7: Implement repository and service (exercised by the integration test in Task 4)**

`packages/commons-drizzle/src/repository.ts`:
```ts
import type { Condition, Page, PageRequest } from "@tiffin/commons";
import { DEFAULT_PAGE } from "@tiffin/commons";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { toDrizzleWhere } from "./condition";
import type { Database } from "./types";

export class BaseRepository<TTable extends PgTable> {
  constructor(
    protected readonly db: Database,
    protected readonly table: TTable,
    protected readonly idColumn: PgColumn,
  ) {}

  async create(values: Record<string, unknown>, actorId?: string | null): Promise<TTable["$inferSelect"]> {
    const toInsert = actorId ? { ...values, createdBy: actorId } : values;
    // Generic base over PgTable: Drizzle's insert typing can't see the concrete shape here.
    const [row] = await this.db.insert(this.table).values(toInsert as never).returning();
    return row as TTable["$inferSelect"];
  }

  async findById(id: string): Promise<TTable["$inferSelect"] | null> {
    const [row] = await this.db.select().from(this.table as PgTable).where(eq(this.idColumn, id)).limit(1);
    return (row as TTable["$inferSelect"]) ?? null;
  }

  async findMany(condition?: Condition, page: PageRequest = DEFAULT_PAGE): Promise<Page<TTable["$inferSelect"]>> {
    const where = toDrizzleWhere(this.table, condition);
    const orderColumn = page.sort
      ? (this.table as unknown as Record<string, PgColumn>)[page.sort.field]
      : this.idColumn;
    const orderBy = page.sort?.dir === "desc" ? desc(orderColumn!) : asc(orderColumn!);

    const rows = await this.db
      .select()
      .from(this.table as PgTable)
      .where(where)
      .orderBy(orderBy)
      .limit(page.size)
      .offset(page.page * page.size);

    const [{ count }] = await this.db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(this.table as PgTable)
      .where(where);

    return { items: rows as TTable["$inferSelect"][], page: page.page, size: page.size, total: count };
  }

  async delete(id: string): Promise<number> {
    const result = await this.db.delete(this.table).where(eq(this.idColumn, id)).returning({ id: this.idColumn });
    return result.length;
  }
}

export class UpdatableRepository<TTable extends PgTable> extends BaseRepository<TTable> {
  async update(id: string, patch: Record<string, unknown>, actorId?: string | null): Promise<TTable["$inferSelect"] | null> {
    const toSet = actorId ? { ...patch, updatedBy: actorId } : patch;
    const [row] = await this.db.update(this.table).set(toSet as never).where(eq(this.idColumn, id)).returning();
    return (row as TTable["$inferSelect"]) ?? null;
  }
}
```

`packages/commons-drizzle/src/service.ts`:
```ts
import type { Condition, Page, PageRequest } from "@tiffin/commons";
import { NotFoundError } from "@tiffin/commons";
import type { PgTable } from "drizzle-orm/pg-core";
import type { BaseRepository, UpdatableRepository } from "./repository";

export class BaseService<TTable extends PgTable> {
  constructor(protected readonly repo: BaseRepository<TTable>) {}

  protected async currentUserId(): Promise<string | null> {
    return null;
  }

  async create(values: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    return this.repo.create(values, await this.currentUserId());
  }

  async read(id: string): Promise<TTable["$inferSelect"]> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError(`Not found: ${id}`);
    return row;
  }

  async list(condition?: Condition, page?: PageRequest): Promise<Page<TTable["$inferSelect"]>> {
    return this.repo.findMany(condition, page);
  }

  async delete(id: string): Promise<number> {
    return this.repo.delete(id);
  }
}

export class UpdatableService<TTable extends PgTable> extends BaseService<TTable> {
  constructor(protected readonly repo: UpdatableRepository<TTable>) {
    super(repo);
  }

  async update(id: string, patch: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const row = await this.repo.update(id, patch, await this.currentUserId());
    if (!row) throw new NotFoundError(`Not found: ${id}`);
    return row;
  }
}
```

`packages/commons-drizzle/src/index.ts`:
```ts
export * from "./columns";
export * from "./condition";
export * from "./repository";
export * from "./service";
export type { Database } from "./types";
```

- [ ] **Step 8: Typecheck and commit**

Run: `pnpm --filter @tiffin/commons-drizzle exec tsc --noEmit`
Expected: no errors.

```bash
git add packages/commons-drizzle
git commit -m "feat(commons-drizzle): base columns, condition translator, repository, service"
```

---

### Task 4: Database wiring in `apps/web` + `feature_flags` schema + integration test

**Files:**
- Create: `apps/web/db/schema/feature-flags.ts`, `apps/web/db/schema/index.ts`, `apps/web/db/client.ts`
- Create: `apps/web/drizzle.config.ts`, `apps/web/.env.example`, `docker-compose.yml` (root)
- Create: `apps/web/db/seed.ts`
- Test: `apps/web/db/__tests__/feature-flags.repo.test.ts` (integration; requires the dev DB)
- Create: `apps/web/vitest.config.ts`

**Interfaces:**
- Consumes: `updatableColumns`, `BaseRepository`/`UpdatableRepository`, `Database` from `@tiffin/commons-drizzle`.
- Produces:
  - `featureFlags` table: `...updatableColumns`, `key` text unique not null, `label` text not null, `description` text, `defaultEnabled` boolean not null default false.
  - `db` (Drizzle client) and `schema` from `apps/web/db/client.ts`.
  - `featureFlagsRepo` factory for tests/services.

- [ ] **Step 1: Local Postgres via Docker**

Create root `docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: tiffin
      POSTGRES_PASSWORD: tiffin
      POSTGRES_DB: tiffin
    ports:
      - "5432:5432"
    volumes:
      - tiffin_pgdata:/var/lib/postgresql/data
volumes:
  tiffin_pgdata:
```

Create `apps/web/.env.example`:
```
DATABASE_URL=postgres://tiffin:tiffin@localhost:5432/tiffin
```

Run:
```bash
cp apps/web/.env.example apps/web/.env.local
docker compose up -d db
```
Expected: container `db` healthy on 5432.

- [ ] **Step 2: Define the `feature_flags` schema and client**

`apps/web/db/schema/feature-flags.ts`:
```ts
import { updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";

export const featureFlags = pgTable("feature_flags", {
  ...updatableColumns,
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  defaultEnabled: boolean("default_enabled").notNull().default(false),
});
```

`apps/web/db/schema/index.ts`:
```ts
export * from "./feature-flags";
```

`apps/web/db/client.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });
export { schema };
```

- [ ] **Step 3: drizzle-kit config and first migration**

`apps/web/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Run:
```bash
cd apps/web
pnpm exec drizzle-kit generate
pnpm exec drizzle-kit migrate
cd ../..
```
Expected: a migration under `apps/web/db/migrations/` and the `feature_flags` table created.

- [ ] **Step 4: Write the failing integration test**

`apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", env: { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://tiffin:tiffin@localhost:5432/tiffin" } } });
```

`apps/web/db/__tests__/feature-flags.repo.test.ts`:
```ts
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../client";
import { featureFlags } from "../schema";

const repo = new UpdatableRepository(db, featureFlags, featureFlags.id);

describe("feature_flags repository (integration)", () => {
  beforeEach(async () => {
    await db.delete(featureFlags);
  });
  afterAll(async () => {
    await db.delete(featureFlags);
  });

  it("creates and reads a flag with audit + uuid id", async () => {
    const created = await repo.create({ key: "beta_wizard", label: "Beta Wizard", defaultEnabled: false }, null);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.createdAt).toBeInstanceOf(Date);
    const read = await repo.findById(created.id);
    expect(read?.key).toBe("beta_wizard");
  });

  it("updates and bumps updatedAt", async () => {
    const created = await repo.create({ key: "k", label: "K", defaultEnabled: false }, null);
    const updated = await repo.update(created.id, { defaultEnabled: true }, null);
    expect(updated?.defaultEnabled).toBe(true);
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it("deletes", async () => {
    const created = await repo.create({ key: "d", label: "D", defaultEnabled: false }, null);
    expect(await repo.delete(created.id)).toBe(1);
    expect(await repo.findById(created.id)).toBeNull();
  });
});
```

- [ ] **Step 5: Run the integration test**

Run: `pnpm --filter web exec vitest run db/__tests__/feature-flags.repo.test.ts`
Expected: PASS (DB must be up + migrated). If it FAILS first because the table is missing, re-run Step 3.

- [ ] **Step 6: Seed script**

`apps/web/db/seed.ts`:
```ts
import { db } from "./client";
import { featureFlags } from "./schema";

const FLAGS = [
  { key: "subscription_wizard", label: "Subscription Wizard", description: "Access the plan builder", defaultEnabled: true },
  { key: "admin_console", label: "Admin Console", description: "User & flag administration", defaultEnabled: false },
];

async function main() {
  for (const f of FLAGS) {
    await db.insert(featureFlags).values(f).onConflictDoNothing({ target: featureFlags.key });
  }
  console.log(`Seeded ${FLAGS.length} feature flags`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Add to `apps/web/package.json` scripts: `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`, `"db:seed": "tsx db/seed.ts"`, and add `tsx` to devDependencies. Run:
```bash
pnpm --filter web add -D tsx
pnpm --filter web db:seed
```
Expected: `Seeded 2 feature flags`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/db apps/web/drizzle.config.ts apps/web/.env.example apps/web/vitest.config.ts docker-compose.yml apps/web/package.json
git commit -m "feat(db): drizzle client, feature_flags schema, migration, seed, integration tests"
```

---

### Task 5: `@tiffin/commons-next` — route-handler factory + live `/api/feature-flags`

**Files:**
- Create: `packages/commons-next/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/query.ts`, `src/response.ts`, `src/error-mapper.ts`, `src/routes.ts`, `src/index.ts`
- Test: `src/query.test.ts`, `src/error-mapper.test.ts`
- Create (app): `apps/web/lib/services/feature-flags.service.ts`, `apps/web/app/api/feature-flags/route.ts`, `apps/web/app/api/feature-flags/[id]/route.ts`, `apps/web/app/api/feature-flags/query/route.ts`

**Interfaces:**
- Consumes: `@tiffin/commons` (`Condition`, `AppError`, `PageRequest`), a `BaseService`/`UpdatableService` instance.
- Produces:
  - `Query = { page?: number; size?: number; sort?: { field: string; dir: "asc" | "desc" }; condition?: Condition }`.
  - `parseListParams(url: URL): PageRequest` (reads `page`, `size`, `sort`, `dir`).
  - `toResponse(err: unknown): Response` — `AppError` → status+JSON, else 500.
  - `json(data, status?)`, `noContent()`.
  - `createCollectionRoute(service, opts?) → { GET, POST }`.
  - `createResourceRoute(service, opts?) → { GET, PUT, PATCH, DELETE }` (PUT/PATCH/DELETE present only when `service` is an `UpdatableService`).
  - `createQueryRoute(service) → { POST }`.
  - `opts.guard?: (req: Request) => Promise<void>` — throws `AuthError`/`ForbiddenError` to block.

- [ ] **Step 1: Manifest, tsconfig, vitest config**

`packages/commons-next/package.json`:
```json
{
  "name": "@tiffin/commons-next",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@tiffin/commons": "workspace:*" },
  "peerDependencies": { "next": "16.2.9" },
  "devDependencies": { "next": "16.2.9", "typescript": "^5", "vitest": "^4.1.9" }
}
```

`packages/commons-next/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2022", "DOM"], "jsx": "preserve" }, "include": ["src"] }
```

`packages/commons-next/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 2: Write failing tests for query parsing + error mapping**

`packages/commons-next/src/query.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseListParams } from "./query";

describe("parseListParams", () => {
  it("defaults to page 0 size 10", () => {
    expect(parseListParams(new URL("http://x/api/r"))).toMatchObject({ page: 0, size: 10 });
  });
  it("reads page/size/sort/dir", () => {
    const p = parseListParams(new URL("http://x/api/r?page=2&size=25&sort=label&dir=desc"));
    expect(p).toEqual({ page: 2, size: 25, sort: { field: "label", dir: "desc" } });
  });
});
```

`packages/commons-next/src/error-mapper.test.ts`:
```ts
import { NotFoundError, ValidationError } from "@tiffin/commons";
import { describe, expect, it } from "vitest";
import { toResponse } from "./error-mapper";

describe("toResponse", () => {
  it("maps AppError to its status", async () => {
    const res = toResponse(new NotFoundError("nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "nope" });
  });
  it("maps ValidationError to 400", () => {
    expect(toResponse(new ValidationError("bad")).status).toBe(400);
  });
  it("maps unknown errors to 500", () => {
    expect(toResponse(new Error("boom")).status).toBe(500);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @tiffin/commons-next test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement query, response, error-mapper**

`packages/commons-next/src/query.ts`:
```ts
import type { Condition, PageRequest } from "@tiffin/commons";

export interface Query {
  page?: number;
  size?: number;
  sort?: { field: string; dir: "asc" | "desc" };
  condition?: Condition;
}

export function parseListParams(url: URL): PageRequest {
  const page = Number(url.searchParams.get("page") ?? "0");
  const size = Number(url.searchParams.get("size") ?? "10");
  const sortField = url.searchParams.get("sort");
  const dir = url.searchParams.get("dir") === "desc" ? "desc" : "asc";
  const req: PageRequest = { page: Number.isFinite(page) ? page : 0, size: Number.isFinite(size) ? size : 10 };
  if (sortField) req.sort = { field: sortField, dir };
  return req;
}
```

`packages/commons-next/src/response.ts`:
```ts
export function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}
```

`packages/commons-next/src/error-mapper.ts`:
```ts
import { AppError } from "@tiffin/commons";
import { json } from "./response";

export function toResponse(err: unknown): Response {
  if (err instanceof AppError) return json({ error: err.message }, err.status);
  console.error(err);
  return json({ error: "Internal Server Error" }, 500);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @tiffin/commons-next test`
Expected: PASS.

- [ ] **Step 6: Implement the route-handler factories**

`packages/commons-next/src/routes.ts`:
```ts
import type { BaseService, UpdatableService } from "@tiffin/commons-drizzle";
import type { PgTable } from "drizzle-orm/pg-core";
import { parseListParams, type Query } from "./query";
import { toResponse } from "./error-mapper";
import { json, noContent } from "./response";

type AnyBase = BaseService<PgTable>;
type AnyUpdatable = UpdatableService<PgTable>;

export interface RouteOptions {
  guard?: (req: Request) => Promise<void>;
}

const runGuard = async (opts: RouteOptions | undefined, req: Request) => {
  if (opts?.guard) await opts.guard(req);
};

export function createCollectionRoute(service: AnyBase, opts?: RouteOptions) {
  return {
    async GET(req: Request) {
      try {
        await runGuard(opts, req);
        const page = parseListParams(new URL(req.url));
        return json(await service.list(undefined, page));
      } catch (e) { return toResponse(e); }
    },
    async POST(req: Request) {
      try {
        await runGuard(opts, req);
        const body = (await req.json()) as Record<string, unknown>;
        return json(await service.create(body), 201);
      } catch (e) { return toResponse(e); }
    },
  };
}

export function createQueryRoute(service: AnyBase, opts?: RouteOptions) {
  return {
    async POST(req: Request) {
      try {
        await runGuard(opts, req);
        const q = (await req.json()) as Query;
        const page = { page: q.page ?? 0, size: q.size ?? 10, sort: q.sort };
        return json(await service.list(q.condition, page));
      } catch (e) { return toResponse(e); }
    },
  };
}

type Ctx = { params: Promise<{ id: string }> };

export function createResourceRoute(service: AnyUpdatable, opts?: RouteOptions) {
  return {
    async GET(req: Request, ctx: Ctx) {
      try {
        await runGuard(opts, req);
        const { id } = await ctx.params;
        return json(await service.read(id));
      } catch (e) { return toResponse(e); }
    },
    async PUT(req: Request, ctx: Ctx) {
      try {
        await runGuard(opts, req);
        const { id } = await ctx.params;
        const body = (await req.json()) as Record<string, unknown>;
        return json(await service.update(id, body));
      } catch (e) { return toResponse(e); }
    },
    async PATCH(req: Request, ctx: Ctx) {
      try {
        await runGuard(opts, req);
        const { id } = await ctx.params;
        const body = (await req.json()) as Record<string, unknown>;
        return json(await service.update(id, body));
      } catch (e) { return toResponse(e); }
    },
    async DELETE(req: Request, ctx: Ctx) {
      try {
        await runGuard(opts, req);
        const { id } = await ctx.params;
        await service.delete(id);
        return noContent();
      } catch (e) { return toResponse(e); }
    },
  };
}
```

> Note: `createResourceRoute` requires an `UpdatableService` (PUT/PATCH present). For an immutable resource, build a read+delete variant in that resource's `[id]/route.ts` directly — out of scope for this plan's `feature_flags` (updatable).

Add `@tiffin/commons-drizzle` to `packages/commons-next/package.json` dependencies (`"@tiffin/commons-drizzle": "workspace:*"`) and `drizzle-orm` to devDependencies; re-run `pnpm install`.

`packages/commons-next/src/index.ts`:
```ts
export * from "./query";
export * from "./response";
export * from "./error-mapper";
export * from "./routes";
```

- [ ] **Step 7: Wire the live `/api/feature-flags` resource in the app**

`apps/web/lib/services/feature-flags.service.ts`:
```ts
import { UpdatableRepository, UpdatableService } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { featureFlags } from "@/db/schema";

const repo = new UpdatableRepository(db, featureFlags, featureFlags.id);
export const featureFlagsService = new UpdatableService(repo);
```

`apps/web/app/api/feature-flags/route.ts`:
```ts
import { createCollectionRoute } from "@tiffin/commons-next";
import { featureFlagsService } from "@/lib/services/feature-flags.service";

export const { GET, POST } = createCollectionRoute(featureFlagsService);
```

`apps/web/app/api/feature-flags/[id]/route.ts`:
```ts
import { createResourceRoute } from "@tiffin/commons-next";
import { featureFlagsService } from "@/lib/services/feature-flags.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(featureFlagsService);
```

`apps/web/app/api/feature-flags/query/route.ts`:
```ts
import { createQueryRoute } from "@tiffin/commons-next";
import { featureFlagsService } from "@/lib/services/feature-flags.service";

export const { POST } = createQueryRoute(featureFlagsService);
```

Confirm `@/` path alias exists in `apps/web/tsconfig.json` (shadcn init adds `"@/*": ["./*"]`); if not, add it.

- [ ] **Step 8: Manual end-to-end check against the running dev server**

Run (DB up + seeded, in one shell):
```bash
pnpm --filter web dev &
sleep 6
curl -s localhost:3000/api/feature-flags | head -c 400; echo
curl -s -X POST localhost:3000/api/feature-flags -H 'content-type: application/json' -d '{"key":"e2e","label":"E2E","defaultEnabled":false}'; echo
curl -s -X POST localhost:3000/api/feature-flags/query -H 'content-type: application/json' -d '{"size":5,"condition":{"type":"filter","field":"key","operator":"eq","value":"e2e"}}'; echo
kill %1
```
Expected: list returns the seeded flags as `{ items: [...], page, size, total }`; POST returns the created flag with a uuid `id` and 201; query returns the `e2e` flag.

- [ ] **Step 9: Typecheck, lint, commit**

Run:
```bash
pnpm typecheck
pnpm --filter web lint
git add packages/commons-next apps/web/lib apps/web/app/api
git commit -m "feat(commons-next): CRUD route-handler factory + live /api/feature-flags resource"
```

---

## Self-Review

**Spec coverage (subsystem A of the design spec):**
- Monorepo Turborepo+pnpm, app → `apps/web` → Task 1. ✅
- `@tiffin/commons` (dto, condition model, errors, enums, util) → Task 2. ✅
- `@tiffin/commons-drizzle` (base columns, repository, service, condition translator) → Task 3. ✅
- DB + Drizzle wiring, migrations, seed, base-entity columns proven → Task 4. ✅
- `@tiffin/commons-next` route-handler factory + consistent REST surface → Task 5. ✅
- uuid PKs + immutable/updatable column tiers → Task 3 (`columns.ts`) + Task 4 (table uses `updatableColumns`). ✅
- Vitest on infra (condition translator, query parse, error map) + integration (repo) → Tasks 2–5. ✅

**Deferred (correct — other plans):** Auth.js/RBAC/flags admin UI (Plan 2 / subsystem B), wizard/checkout/pricing (Plan 3 / subsystem C). `feature_flags` table is created here as the stack's test fixture and is reused by Plan 2.

**Placeholder scan:** none — every code step shows complete code; every run step states the exact command + expected result.

**Type consistency:** `BaseRepository`/`UpdatableRepository`/`BaseService`/`UpdatableService`, `toDrizzleWhere(table, condition)`, `parseListParams(url)`, `toResponse(err)`, `createCollectionRoute/createResourceRoute/createQueryRoute` names match across Tasks 3–5 and their consumers. `featureFlags` table + `featureFlagsService` consistent in Tasks 4–5.

## Note on subsequent plans
- **Plan 2 — Auth + RBAC + Flags (B):** `next-auth@beta` (Auth.js v5) + `@auth/drizzle-adapter`, `users`/`accounts`/`sessions`/`verification_tokens` + `user_feature_flags`, credential→session bridge, `proxy.ts` guard, admin flag/role UI, `currentUserId()` override wired to the session.
- **Plan 3 — Subscription wizard + checkout (C):** catalog tables + seed, pricing engine (Vitest), 4-step wizard, 2-step checkout, activation + auto-provision.
