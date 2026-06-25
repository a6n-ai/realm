# Inquiry CRM Phase 3 — Sortable Tables (app-wide)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** URL-driven column sorting on every data table — inquiries, orders, customers, users — via one shared `<SortableHeader>` + a whitelisted `parseSort` helper. Sort lives in `searchParams` (server-driven, shareable, back-button-correct).

**Architecture:** A pure `parseSort(searchParams, allowed, fallback)` returns `{ column, dir }` from a whitelist (no SQL injection). A client `<SortableHeader>` renders a `TableHead` that toggles `?sort=&dir=` through `next/navigation` while preserving other params. Server pages read the parsed sort and apply `orderBy`. The two `ListRow` lists (orders, customers) convert to shadcn `Table` for consistency.

**Tech Stack:** Next.js (non-stock — read `node_modules/next/dist/docs/`), Drizzle, shadcn `Table`, Vitest.

## Global Constraints

- Sort columns are WHITELISTED per table — never interpolate a raw `sort` param into SQL.
- Client filters/search that already exist stay client-side; only sort moves to the URL/server.
- Shared UI → `apps/web/components/ds`. No new deps. Ignore the `next-id` flake.
- Default sort per table preserves today's behavior (e.g. orders by created desc).

## File Structure

- `apps/web/lib/list/sort.ts` — NEW `parseSort` + `SortState` type.
- `apps/web/components/ds/sortable-header.tsx` — NEW client `<SortableHeader>`; export from `ds/index.ts`.
- `apps/web/app/(dashboard)/dashboard/inquiries/{page,inquiries-list}.tsx` — sortable pipeline table.
- `apps/web/lib/services/inquiries.service.ts` — `listForPipeline(sort)`.
- `apps/web/app/(dashboard)/dashboard/orders/{page,orders-list}.tsx` + `lib/services/orders.service.ts` — sort param + Table.
- `apps/web/app/(dashboard)/dashboard/customers/{page,customers-list}.tsx` — sort + Table.
- `apps/web/app/(dashboard)/dashboard/users/{page,user-row}.tsx` — sortable headers.

---

### Task 1: `parseSort` helper + `<SortableHeader>`

**Files:**
- Create: `apps/web/lib/list/sort.ts`
- Create: `apps/web/components/ds/sortable-header.tsx`
- Modify: `apps/web/components/ds/index.ts`
- Test: `apps/web/lib/list/__tests__/sort.test.ts` (create)

**Interfaces:**
- Produces:
  - `type SortDir = "asc" | "desc"; type SortState<K> = { column: K; dir: SortDir }`.
  - `parseSort<K extends string>(sp: { sort?: string; dir?: string }, allowed: readonly K[], fallback: SortState<K>): SortState<K>` — returns `fallback` when `sort` is absent or not in `allowed`; `dir` defaults to `"asc"` unless `"desc"`.
  - `<SortableHeader column label currentSort currentDir />` — a `TableHead` link toggling sort.

- [ ] **Step 1: Failing test for parseSort**

```ts
import { describe, it, expect } from "vitest";
import { parseSort } from "../sort";

const allowed = ["name", "created"] as const;
const fb = { column: "created", dir: "desc" } as const;

describe("parseSort", () => {
  it("returns fallback when sort missing", () => {
    expect(parseSort({}, allowed, fb)).toEqual(fb);
  });
  it("rejects a non-whitelisted column", () => {
    expect(parseSort({ sort: "password); drop table", dir: "asc" }, allowed, fb)).toEqual(fb);
  });
  it("accepts a whitelisted column + dir", () => {
    expect(parseSort({ sort: "name", dir: "asc" }, allowed, fb)).toEqual({ column: "name", dir: "asc" });
  });
  it("defaults dir to asc for an unknown dir", () => {
    expect(parseSort({ sort: "name", dir: "sideways" }, allowed, fb)).toEqual({ column: "name", dir: "asc" });
  });
});
```

Run: `pnpm --filter web test lib/list` → FAIL.

- [ ] **Step 2: Implement `sort.ts`**

```ts
export type SortDir = "asc" | "desc";
export type SortState<K extends string = string> = { column: K; dir: SortDir };

export function parseSort<K extends string>(
  sp: { sort?: string; dir?: string },
  allowed: readonly K[],
  fallback: SortState<K>,
): SortState<K> {
  const column = sp.sort && (allowed as readonly string[]).includes(sp.sort) ? (sp.sort as K) : null;
  if (!column) return fallback;
  const dir: SortDir = sp.dir === "desc" ? "desc" : "asc";
  return { column, dir };
}
```

Run: `pnpm --filter web test lib/list` → PASS.

- [ ] **Step 3: `<SortableHeader>`**

```tsx
"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon } from "lucide-react";
import { TableHead } from "@/components/ui/table";

export function SortableHeader({ column, label, currentSort, currentDir, className }: {
  column: string; label: string; currentSort: string; currentDir: "asc" | "desc"; className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = currentSort === column;
  const nextDir = active && currentDir === "asc" ? "desc" : "asc";

  const onClick = () => {
    const sp = new URLSearchParams(params.toString());
    sp.set("sort", column);
    sp.set("dir", nextDir);
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const Icon = active ? (currentDir === "asc" ? ChevronUpIcon : ChevronDownIcon) : ChevronsUpDownIcon;
  return (
    <TableHead className={className}>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground text-muted-foreground data-[active=true]:text-foreground" data-active={active}>
        {label}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}
```

Export from `ds/index.ts`: `export * from "./sortable-header";`.

- [ ] **Step 4: Typecheck + commit**

`pnpm --filter web exec tsc --noEmit` → PASS.

```bash
git add apps/web/lib/list apps/web/components/ds/sortable-header.tsx apps/web/components/ds/index.ts
git commit -m "feat(ds): parseSort helper + SortableHeader (URL-driven table sort)"
```

---

### Task 2: Sortable inquiries pipeline table

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts` (`listForPipeline(sort)`)
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/page.tsx` (read searchParams)
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/inquiries-list.tsx` (SortableHeader)

**Interfaces:**
- Produces: `listForPipeline(sort: SortState<"name"|"owner"|"stage"|"source"|"lastTouch"|"nextAction"|"created">)` ordering the query; the table headers become `<SortableHeader>`.

- [ ] **Step 1: Add sort to the query**

In `listForPipeline`, accept `sort` and build `orderBy` from a column map (default `{ column: "created", dir: "desc" }`):

```ts
const SORT_COL = {
  name: inquiries.fullName, stage: inquiries.stage, source: leadSources.label,
  created: inquiries.createdAt, owner: users.name, lastTouch: agg.lastTouchAt,
} as const;
// nextAction sorts by the correlated subquery alias; fall back to created when unsupported.
const col = SORT_COL[sort.column as keyof typeof SORT_COL] ?? inquiries.createdAt;
// ...orderBy(sort.dir === "asc" ? asc(col) : desc(col))
```

Add `asc` to the drizzle import. Keep the existing `limit(500)` and overdue mapping.

- [ ] **Step 2: Page reads sort**

`page.tsx`: `searchParams: Promise<{ sort?: string; dir?: string }>`; `const sort = parseSort(await searchParams, ["name","owner","stage","source","lastTouch","created"], { column: "created", dir: "desc" })`; pass `sort` into `listForPipeline(sort)` and into `<InquiriesList sort={sort} />`.

- [ ] **Step 3: Headers → SortableHeader**

In `inquiries-list.tsx`, replace the plain `TableHead`s with `<SortableHeader column="name" label="Name" currentSort={sort.column} currentDir={sort.dir} />` etc. (Non-sortable columns stay plain `TableHead`.) Keep the client stage/search/owner/overdue filters as-is.

- [ ] **Step 4: Typecheck + manual + commit**

`pnpm --filter web exec tsc --noEmit` → PASS. Manual: click Name/Owner/Stage headers → URL gains `?sort=&dir=`, order flips.

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/app/\(dashboard\)/dashboard/inquiries
git commit -m "feat(inquiries): sortable pipeline table headers"
```

---

### Task 3: Orders → sortable table

**Files:**
- Modify: `apps/web/lib/services/orders.service.ts` (`listOrders` sort param)
- Modify: `apps/web/app/(dashboard)/dashboard/orders/page.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/orders/orders-list.tsx` (ListRow → Table)

**Interfaces:**
- Produces: `listOrders({ status?, search?, sort? })`; `OrdersList` renders a shadcn `Table` with `<SortableHeader>` for name/deployment/status/start/total/created; client status pills + search retained.

- [ ] **Step 1: Sort in `listOrders`**

Add `sort?: SortState<...>` to the filter arg; map columns (`fullName`/`deploymentId`/`status`/`startDate`/`total`/`createdAt`) → `orderBy`. Default preserves today's order (created desc — confirm current default and keep it).

- [ ] **Step 2: Page**

`page.tsx`: read `searchParams` (`status?`, `q?`, `sort?`, `dir?`), `parseSort(...)`, pass to `listOrders`. (Status/search may stay client; sort goes server.)

- [ ] **Step 3: List → Table**

Rewrite `orders-list.tsx` to a shadcn `Table`: columns Name, Deployment, City, Status (`OrderStatusBadge`), Start, Total (`fmt`), Created. Sortable headers via `<SortableHeader>`. Keep `FilterBar` + status `FilterPill`s + `SearchInput`. Row click → order detail link.

- [ ] **Step 4: Typecheck + manual + commit**

`pnpm --filter web exec tsc --noEmit` → PASS. Manual: sort by Total/Start/Status.

```bash
git add apps/web/lib/services/orders.service.ts apps/web/app/\(dashboard\)/dashboard/orders
git commit -m "feat(orders): sortable orders table"
```

---

### Task 4: Customers → sortable table

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/customers/page.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/customers/customers-list.tsx`

**Interfaces:**
- Produces: customers query orders by a whitelisted sort (email/phone/orderCount); `CustomersList` renders a `Table` with `<SortableHeader>`; client search retained.

- [ ] **Step 1: Page sort**

In `customers/page.tsx`, read `searchParams`; `parseSort(..., ["email","phone","orders"], { column: "orders", dir: "desc" })`; build `orderBy` (`orders` → `count(orders.id)`, `email` → `users.email`, `phone` → `users.phone`); keep `.limit(500)`.

- [ ] **Step 2: List → Table**

Rewrite `customers-list.tsx` to a `Table`: columns Email, Phone, Orders, Latest status (`OrderStatusBadge`). Sortable headers. Keep the client search. Row click → customer detail.

- [ ] **Step 3: Typecheck + manual + commit**

`pnpm --filter web exec tsc --noEmit` → PASS.

```bash
git add apps/web/app/\(dashboard\)/dashboard/customers
git commit -m "feat(customers): sortable customers table"
```

---

### Task 5: Users → sortable headers

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/users/page.tsx`

**Interfaces:**
- Produces: the users table headers (Contact, Role) become sortable via `<SortableHeader>`; query orders by a whitelisted sort (email/role), default email asc.

- [ ] **Step 1: Page sort**

Read `searchParams`; `parseSort(..., ["email","role"], { column: "email", dir: "asc" })`; order the `users` select; replace the Contact/Role `TableHead`s with `<SortableHeader>` (Feature-flags column stays plain).

- [ ] **Step 2: Typecheck + full test run + commit**

`pnpm --filter web exec tsc --noEmit` → PASS. `pnpm --filter web test` → green except `next-id` flake.

```bash
git add apps/web/app/\(dashboard\)/dashboard/users
git commit -m "feat(users): sortable users table headers"
```

---

## Self-Review

**Coverage:** shared infra (Task 1) applied to inquiries (2), orders (3), customers (4), users (5) — every data table. Dishes/menus are CRUD editors, not data tables → intentionally out of scope.

**Placeholder scan:** Task 1 carries full code + tests; Tasks 2–5 give the exact column maps, parse calls, and the Table conversion plus retained filters. No "TODO"/"add sorting"/"similar to".

**Type consistency:** `SortState<K>`/`parseSort` (Task 1) consumed identically in Tasks 2–5; `<SortableHeader>` prop names (`column`/`label`/`currentSort`/`currentDir`) used the same everywhere. Whitelists are per-table literals matched to each query's column map.

**Security:** the `sort` param is whitelisted in `parseSort`; non-whitelisted values fall back — no raw param reaches Drizzle.

---

## Execution Handoff

Executes via an **ultracode workflow**, same shape as prior phases: sequential agents (infra → inquiries → orders → customers → users), `tsc`+`vitest` verify gate (ignore `next-id`), adversarial review. No DB/migration work. UI tasks report manual sort-click checks.
