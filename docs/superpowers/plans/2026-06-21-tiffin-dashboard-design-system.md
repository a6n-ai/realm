# Dashboard Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared `apps/web/components/ds/` design-system layer that canonicalizes the redesign language (gradient titles, icon chips, glow/lift cards, mono oklch palette) into reusable composed components, then retrofit every dashboard page to them — presentation only, no behavior change.

**Architecture:** Thin typed wrappers over the existing shadcn primitives + the redesign utility classes, exported from `components/ds/`. The only real logic (breadcrumb route-derivation, stage→variant mapping) lives in pure functions with node unit tests; the presentational components are verified by typecheck + build + a `/dashboard/design` showcase. Rollout is markup-only per page; the existing test suite must stay green throughout.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (CSS `@theme`), shadcn/ui, lucide-react, Vitest (node env).

## Global Constraints

- **Components live in `apps/web/components/ds/`**, one responsibility per file, exported via `ds/index.ts`. Pages import from `@/components/ds`, never the raw redesign classes.
- **Canonical look (from the approved mockup):** header = `group` wrapper + icon chip (`bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg` with a lucide icon `className="icon-pop size-5"`) + gradient-text title (`gradient-text text-2xl font-semibold`); cards use `card-glow` (default) / `hover-lift` (lift) / bordered-flat. Reuse the EXISTING classes in `globals.css` (`gradient-text`, `card-glow`, `hover-lift`, `icon-pop`) — do NOT redefine them.
- **Tokens:** add an `ok`/`warn`/`bad` semantic trio (light + dark) to `globals.css` `@theme`/`:root`/`.dark`; base palette stays neutral oklch. These are the ONLY hues.
- **Breadcrumbs auto-derive** from `usePathname()` via a central `route-labels.ts` map; dynamic (`[id]`) segments accept a per-page override. Unknown segments fall back to title-cased text.
- **Rollout is presentation-only** — no change to data loading, server actions, service calls, or props' *values*; only the surrounding markup. The existing test suite stays green (no test should need changing for a page retrofit).
- **Reuse each page's existing icon** (the one its sidebar nav entry uses, from `components/dashboard/app-sidebar.tsx`).
- **Verify per task:** `pnpm --filter web exec tsc --noEmit` clean + `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm --filter web exec vitest run <touched tests>` green; rollout tasks also `DATABASE_URL=… pnpm build`. DB-backed commands need the `DATABASE_URL` prefix.
- **TypeScript only, no unnecessary comments. Plain commits, NO `Co-Authored-By`. Commit tests.**
- shadcn APIs available: `Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter` (`@/components/ui/card`); `Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator` (`@/components/ui/breadcrumb`); `Badge` (`@/components/ui/badge`); `cn` (`@/lib/utils`).

---

## Phase 1 — Design-system components

### Task 1: Semantic tokens + `Card` variants

**Files:**
- Modify: `apps/web/app/globals.css`
- Create: `apps/web/components/ds/card.tsx`
- Test: `apps/web/components/ds/__tests__/card-variant.test.ts`

**Interfaces:**
- Produces: `DsCard` (named export `Card` from `ds/card`) with `variant?: "glow" | "lift" | "flat"` (default `"glow"`); re-exports `CardHeader/CardTitle/CardDescription/CardContent/CardFooter`. A pure `cardVariantClass(variant)` for testing.

- [ ] **Step 1: Add semantic tokens** — in `apps/web/app/globals.css`, add to the `@theme inline` block (alongside the existing `--color-*` mappings) and to `:root` + `.dark`:

In `@theme inline`:
```css
  --color-ok: var(--ok);
  --color-warn: var(--warn);
  --color-bad: var(--bad);
```
In `:root`:
```css
  --ok: oklch(0.62 0.13 150);
  --warn: oklch(0.70 0.13 70);
  --bad: oklch(0.60 0.16 25);
```
In `.dark`:
```css
  --ok: oklch(0.72 0.14 150);
  --warn: oklch(0.78 0.14 70);
  --bad: oklch(0.68 0.17 25);
```

- [ ] **Step 2: Write the failing test** — `apps/web/components/ds/__tests__/card-variant.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { cardVariantClass } from "../card";

describe("cardVariantClass", () => {
  it("defaults to glow", () => {
    expect(cardVariantClass(undefined)).toContain("card-glow");
  });
  it("lift uses hover-lift", () => {
    expect(cardVariantClass("lift")).toContain("hover-lift");
  });
  it("flat uses a border, not glow", () => {
    const c = cardVariantClass("flat");
    expect(c).toContain("border");
    expect(c).not.toContain("card-glow");
  });
});
```

- [ ] **Step 3: Run — fails** — `cd apps/web && pnpm exec vitest run components/ds/__tests__/card-variant.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement** — `apps/web/components/ds/card.tsx`

```tsx
import type { ComponentProps } from "react";
import {
  Card as UiCard,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type CardVariant = "glow" | "lift" | "flat";

export function cardVariantClass(variant: CardVariant = "glow"): string {
  if (variant === "lift") return "hover-lift";
  if (variant === "flat") return "border";
  return "card-glow";
}

export function Card({
  variant = "glow",
  className,
  ...props
}: ComponentProps<typeof UiCard> & { variant?: CardVariant }) {
  return <UiCard className={cn(cardVariantClass(variant), className)} {...props} />;
}

export { CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
```

- [ ] **Step 5: Run — passes** — same command → PASS.

- [ ] **Step 6: Verify + commit** — `pnpm --filter web exec tsc --noEmit` clean.
```bash
git add apps/web/app/globals.css apps/web/components/ds/card.tsx apps/web/components/ds/__tests__/card-variant.test.ts
git commit -m "feat(ds): semantic ok/warn/bad tokens + Card variants"
```

---

### Task 2: Breadcrumbs + route labels + PageHeader + PageShell

**Files:**
- Create: `apps/web/components/ds/route-labels.ts`, `apps/web/components/ds/breadcrumbs.tsx`, `apps/web/components/ds/page-header.tsx`, `apps/web/components/ds/page-shell.tsx`
- Test: `apps/web/components/ds/__tests__/breadcrumbs.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `deriveBreadcrumbs(pathname: string, overrides?: Record<string, string>): { label: string; href?: string }[]` (pure); `Breadcrumbs({ overrides? })`; `PageHeader({ icon, title, subtitle?, breadcrumbOverrides?, actions? })`; `PageShell({ children })`.

- [ ] **Step 1: Route labels** — `apps/web/components/ds/route-labels.ts`

```ts
export const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  inquiries: "Inquiries",
  users: "Users",
  catalog: "Catalog",
  dishes: "Dishes",
  menus: "Weekly Menus",
  meals: "My Meals",
  account: "Account",
  settings: "Settings",
  "meal-slots": "Meal slots",
  order: "New order",
  design: "Design system",
};

export function labelForSegment(segment: string): string {
  return ROUTE_LABELS[segment] ?? segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
```

- [ ] **Step 2: Write the failing test** — `apps/web/components/ds/__tests__/breadcrumbs.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { deriveBreadcrumbs } from "../breadcrumbs";

describe("deriveBreadcrumbs", () => {
  it("maps known dashboard segments", () => {
    expect(deriveBreadcrumbs("/dashboard/inquiries")).toEqual([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Inquiries" },
    ]);
  });
  it("title-cases unknown segments", () => {
    const crumbs = deriveBreadcrumbs("/dashboard/widgets-list");
    expect(crumbs.at(-1)).toEqual({ label: "Widgets List" });
  });
  it("applies an override for a dynamic segment", () => {
    const crumbs = deriveBreadcrumbs("/dashboard/inquiries/inq_abc", { inq_abc: "Riya Anand" });
    expect(crumbs.map((c) => c.label)).toEqual(["Dashboard", "Inquiries", "Riya Anand"]);
  });
});
```

- [ ] **Step 3: Run — fails** — `cd apps/web && pnpm exec vitest run components/ds/__tests__/breadcrumbs.test.ts` → FAIL.

- [ ] **Step 4: Implement breadcrumbs** — `apps/web/components/ds/breadcrumbs.tsx`

```tsx
"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { labelForSegment } from "./route-labels";

export type Crumb = { label: string; href?: string };

export function deriveBreadcrumbs(pathname: string, overrides: Record<string, string> = {}): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((seg, i) => {
    const isLast = i === segments.length - 1;
    const label = overrides[seg] ?? labelForSegment(seg);
    return isLast ? { label } : { label, href: "/" + segments.slice(0, i + 1).join("/") };
  });
}

export function Breadcrumbs({ overrides }: { overrides?: Record<string, string> }) {
  const pathname = usePathname();
  const crumbs = deriveBreadcrumbs(pathname, overrides);
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            <BreadcrumbItem>
              {c.href ? <BreadcrumbLink href={c.href}>{c.label}</BreadcrumbLink> : <BreadcrumbPage>{c.label}</BreadcrumbPage>}
            </BreadcrumbItem>
            {i < crumbs.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
```

- [ ] **Step 5: Run — passes** — same command → PASS.

- [ ] **Step 6: PageShell** — `apps/web/components/ds/page-shell.tsx`

```tsx
import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return <section className="mx-auto w-full max-w-6xl space-y-6">{children}</section>;
}
```

- [ ] **Step 7: PageHeader** — `apps/web/components/ds/page-header.tsx`

```tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Breadcrumbs } from "./breadcrumbs";

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  breadcrumbOverrides,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  breadcrumbOverrides?: Record<string, string>;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <Breadcrumbs overrides={breadcrumbOverrides} />
      <div className="flex items-start justify-between gap-4">
        <div className="group flex items-center gap-3">
          <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
            <Icon className="icon-pop size-5" />
          </span>
          <div>
            <h1 className="gradient-text text-2xl font-semibold">{title}</h1>
            {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Verify + commit** — `pnpm --filter web exec tsc --noEmit` clean.
```bash
git add apps/web/components/ds/route-labels.ts apps/web/components/ds/breadcrumbs.tsx apps/web/components/ds/page-header.tsx apps/web/components/ds/page-shell.tsx apps/web/components/ds/__tests__/breadcrumbs.test.ts
git commit -m "feat(ds): auto breadcrumbs + PageHeader + PageShell"
```

---

### Task 3: StatCard, SectionCard, ListRow, EmptyState, StageBadge + barrel

**Files:**
- Create: `apps/web/components/ds/stat-card.tsx`, `section-card.tsx`, `list-row.tsx`, `empty-state.tsx`, `stage-badge.tsx`, `index.ts`
- Test: `apps/web/components/ds/__tests__/stage-badge.test.ts`

**Interfaces:**
- Consumes: `Card` (Task 1).
- Produces: `StatCard({ label, value, icon?, delta? })`; `SectionCard({ title, subtitle?, action?, children })`; `ListRow({ avatar?, title, meta?, trailing?, href? })`; `EmptyState({ icon, message, action? })`; `StageBadge({ stage })` + pure `stageVariant(stage)`; `ds/index.ts` barrel re-exporting all `ds/*`.

- [ ] **Step 1: Write the failing test** — `apps/web/components/ds/__tests__/stage-badge.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { stageVariant } from "../stage-badge";

describe("stageVariant", () => {
  it("maps stages to semantic variants", () => {
    expect(stageVariant("new")).toBe("ok");
    expect(stageVariant("follow_up")).toBe("warn");
    expect(stageVariant("lost")).toBe("bad");
    expect(stageVariant("contacted")).toBe("neutral");
    expect(stageVariant("converted")).toBe("ok");
  });
  it("falls back to neutral for unknown", () => {
    expect(stageVariant("zzz")).toBe("neutral");
  });
});
```

- [ ] **Step 2: Run — fails** — `cd apps/web && pnpm exec vitest run components/ds/__tests__/stage-badge.test.ts` → FAIL.

- [ ] **Step 3: StageBadge** — `apps/web/components/ds/stage-badge.tsx` (folds in the existing `inquiries/stage-badge.tsx`, now semantic)

```tsx
import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", follow_up: "Follow-up", converted: "Converted", lost: "Lost",
};
export type StageVariant = "neutral" | "ok" | "warn" | "bad";
const STAGE_VARIANT: Record<string, StageVariant> = {
  new: "ok", contacted: "neutral", follow_up: "warn", converted: "ok", lost: "bad",
};
export function stageVariant(stage: string): StageVariant {
  return STAGE_VARIANT[stage] ?? "neutral";
}
const VARIANT_CLASS: Record<StageVariant, string> = {
  neutral: "bg-muted text-muted-foreground border",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
};

export function StageBadge({ stage }: { stage: string }) {
  const v = stageVariant(stage);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", VARIANT_CLASS[v])}>
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}
```

- [ ] **Step 4: Run — passes** — same command → PASS.

- [ ] **Step 5: StatCard** — `apps/web/components/ds/stat-card.tsx`

```tsx
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

export function StatCard({
  label, value, icon: Icon, delta,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  delta?: { dir: "up" | "down"; text: string };
}) {
  return (
    <Card className="p-4">
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>{label}</span>
        {Icon && <Icon className="size-4" />}
      </div>
      <div className="gradient-text mt-2 text-2xl font-semibold">{value}</div>
      {delta && <div className={cn("mt-1 text-xs", delta.dir === "up" ? "text-ok" : "text-bad")}>{delta.text}</div>}
    </Card>
  );
}
```

- [ ] **Step 6: SectionCard** — `apps/web/components/ds/section-card.tsx`

```tsx
import type { ReactNode } from "react";
import { Card } from "./card";

export function SectionCard({
  title, subtitle, action, children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {subtitle && <p className="text-muted-foreground mb-3 text-sm">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-3"}>{children}</div>
    </Card>
  );
}
```

- [ ] **Step 7: ListRow** — `apps/web/components/ds/list-row.tsx`

```tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function ListRow({
  avatar, title, meta, trailing, href,
}: {
  avatar?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  href?: string;
}) {
  const inner = (
    <div className={cn("flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors", href && "hover:bg-accent")}>
      <div className="flex items-center gap-3">
        {avatar && <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg text-xs font-semibold">{avatar}</span>}
        <div>
          <div className="font-medium">{title}</div>
          {meta && <div className="text-muted-foreground text-xs">{meta}</div>}
        </div>
      </div>
      {trailing && <div className="flex items-center gap-2">{trailing}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
```

- [ ] **Step 8: EmptyState** — `apps/web/components/ds/empty-state.tsx`

```tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon, message, action,
}: {
  icon: LucideIcon;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-3 px-5 py-12 text-center">
      <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-xl">
        <Icon className="size-6" />
      </span>
      <p className="text-muted-foreground max-w-sm">{message}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 9: Barrel** — `apps/web/components/ds/index.ts`

```ts
export * from "./card";
export * from "./page-shell";
export * from "./page-header";
export * from "./breadcrumbs";
export * from "./stat-card";
export * from "./section-card";
export * from "./list-row";
export * from "./empty-state";
export * from "./stage-badge";
```

- [ ] **Step 10: Verify + commit** — `pnpm --filter web exec tsc --noEmit` clean.
```bash
git add apps/web/components/ds
git commit -m "feat(ds): StatCard, SectionCard, ListRow, EmptyState, StageBadge + barrel"
```

---

### Task 4: Filter/list controls — FilterPill, SearchInput, FilterBar, Tabs, Pagination

**Files:**
- Create: `apps/web/components/ds/filter-pill.tsx`, `search-input.tsx`, `filter-bar.tsx`, `tabs.tsx`, `pagination.tsx`
- Modify: `apps/web/components/ds/index.ts` (add the new exports)
- Test: `apps/web/components/ds/__tests__/pagination.test.ts`

**Interfaces:**
- Consumes: `ui/input`, `ui/tabs`, `ui/button`, `cn`.
- Produces: `FilterPill({ label, active, count?, onClick })`; `SearchInput({ value, onChange, placeholder? })`; `FilterBar({ search?, filters?, sort?, actions? })`; `Tabs` (+ `TabsList`/`TabsTrigger`/`TabsContent` re-exported); `Pagination({ page, pageCount, onPage })` + pure `pageRange(page, pageCount): number[]`.

- [ ] **Step 1: Write the failing test** — `apps/web/components/ds/__tests__/pagination.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { pageRange } from "../pagination";

describe("pageRange", () => {
  it("returns all pages when few", () => {
    expect(pageRange(1, 3)).toEqual([1, 2, 3]);
  });
  it("windows around the current page when many", () => {
    expect(pageRange(5, 20)).toEqual([4, 5, 6]);
  });
  it("clamps at the start", () => {
    expect(pageRange(1, 20)).toEqual([1, 2, 3]);
  });
  it("clamps at the end", () => {
    expect(pageRange(20, 20)).toEqual([18, 19, 20]);
  });
  it("handles a single page", () => {
    expect(pageRange(1, 1)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run — fails** — `cd apps/web && pnpm exec vitest run components/ds/__tests__/pagination.test.ts` → FAIL.

- [ ] **Step 3: Pagination** — `apps/web/components/ds/pagination.tsx`

```tsx
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function pageRange(page: number, pageCount: number): number[] {
  if (pageCount <= 3) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const start = Math.min(Math.max(1, page - 1), pageCount - 2);
  return [start, start + 1, start + 2];
}

export function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</Button>
      {pageRange(page, pageCount).map((p) => (
        <Button key={p} variant={p === page ? "default" : "outline"} size="sm" onClick={() => onPage(p)}>{p}</Button>
      ))}
      <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}
```

- [ ] **Step 4: Run — passes** — same command → PASS.

- [ ] **Step 5: FilterPill** — `apps/web/components/ds/filter-pill.tsx`

```tsx
import { cn } from "@/lib/utils";

export function FilterPill({
  label, active, count, onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground border-transparent" : "bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-primary-foreground/20" : "bg-muted")}>{count}</span>
      )}
    </button>
  );
}
```

- [ ] **Step 6: SearchInput** — `apps/web/components/ds/search-input.tsx`

```tsx
"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchInput({
  value, onChange, placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <SearchIcon className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8 pr-8" />
      {value && (
        <button type="button" onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2" aria-label="Clear search">
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: FilterBar** — `apps/web/components/ds/filter-bar.tsx`

```tsx
import type { ReactNode } from "react";

export function FilterBar({
  search, filters, sort, actions,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  sort?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {search && <div className="min-w-56 flex-1">{search}</div>}
      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      {sort}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 8: Tabs** — `apps/web/components/ds/tabs.tsx` (thin re-export wrapper for a single consistent import site)

```tsx
export { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
```

- [ ] **Step 9: Barrel** — append to `apps/web/components/ds/index.ts`:

```ts
export * from "./filter-pill";
export * from "./search-input";
export * from "./filter-bar";
export * from "./tabs";
export * from "./pagination";
```

- [ ] **Step 10: Verify + commit** — `pnpm --filter web exec tsc --noEmit` clean.
```bash
git add apps/web/components/ds
git commit -m "feat(ds): FilterPill, SearchInput, FilterBar, Tabs, Pagination"
```

---

### Task 5: `/dashboard/design` showcase (admin-only)

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/design/page.tsx`

**Interfaces:**
- Consumes: all `ds/*` (Task 1–3).

- [ ] **Step 1: Showcase page** — `apps/web/app/(dashboard)/dashboard/design/page.tsx` (server component): `await requireAdmin()` (from `@/lib/auth/guards`), then render inside `PageShell` a `PageHeader` (icon `PaletteIcon` from lucide-react, title "Design system", subtitle "Shared components used across the dashboard") followed by `SectionCard`s demonstrating: Card variants (glow/lift/flat), a row of 4 `StatCard`s (one with `delta` up, one down), a `FilterBar` (with `SearchInput` + a row of `FilterPill`s, one active + counts), `Tabs`, `Pagination`, `ListRow`s (with avatar + `StageBadge` trailing), `EmptyState`, and all five `StageBadge` stages. Pure presentation. Use representative static data. (The interactive controls — `SearchInput`/`FilterPill`/`Pagination`/`Tabs` — need client state, so put that interactive block in a small `"use client"` child component the server page renders.)

- [ ] **Step 2: Add to sidebar** — in `apps/web/components/dashboard/app-sidebar.tsx`, add `{ title: "Design system", href: "/dashboard/design", icon: PaletteIcon, roles: ["admin"] }` to the NAV array (import `PaletteIcon`).

- [ ] **Step 3: Verify + commit** — `pnpm --filter web exec tsc --noEmit` clean; `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build` → `/dashboard/design` in the route manifest.
```bash
git add apps/web/app/\(dashboard\)/dashboard/design apps/web/components/dashboard/app-sidebar.tsx
git commit -m "feat(ds): /dashboard/design showcase + sidebar entry"
```

---

## Phase 2 — Roll the system across dashboard pages (presentation-only)

**Retrofit pattern (apply to each page):** wrap the page body in `PageShell`; replace the bespoke heading (`<h1 className="ln …">` or the inline icon-chip header) with `<PageHeader icon={<sidebar icon>} title=… subtitle?=… actions?=… />`; replace bespoke cards with `Card`/`SectionCard`/`StatCard`, repeated bordered rows with `ListRow`, empty blocks with `EmptyState`, stage pills with `StageBadge`. Change ONLY markup — never the data fetching, server actions, or prop values. After each task: `pnpm --filter web exec tsc --noEmit` clean, the page's existing tests (if any) green, and `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build` green.

### Task 6: Overview, Account, Settings, Meal-slots

**Files (modify):** `app/(dashboard)/dashboard/page.tsx`, `account/page.tsx`, `settings/page.tsx`, `settings/meal-slots/page.tsx`.

- [ ] **Step 1** — `dashboard/page.tsx` (overview): `PageShell` + `PageHeader` (icon `LayoutDashboardIcon`, title "Overview"). If it shows metric tiles, use `StatCard`; otherwise `SectionCard`s. Remove the `ln`/`TypographyH2` heading.
- [ ] **Step 2** — `account/page.tsx`: `PageHeader` (icon `UserIcon`, title "Account"); wrap form sections in `SectionCard`. Keep the form + actions untouched.
- [ ] **Step 3** — `settings/page.tsx`: `PageHeader` (icon `SettingsIcon`, title "Settings"); `SectionCard`s for groups.
- [ ] **Step 4** — `settings/meal-slots/page.tsx`: `PageHeader` (icon `SettingsIcon`, title "Meal slots", subtitle "Enable the slots customers can order"); the slot toggles in a `SectionCard`. Keep `SlotToggle` + its action.
- [ ] **Step 5: Verify + commit**
```bash
git add apps/web/app/\(dashboard\)/dashboard/page.tsx apps/web/app/\(dashboard\)/dashboard/account apps/web/app/\(dashboard\)/dashboard/settings
git commit -m "feat(ds): adopt design system on overview/account/settings/meal-slots"
```

### Task 7: Users, Catalog

**Files (modify):** `app/(dashboard)/dashboard/users/page.tsx` (+ `user-row.tsx` if it renders headings/badges), `catalog/page.tsx`, `catalog/[resource]/page.tsx` (+ `resource-editor.tsx` for cards/rows only).

- [ ] **Step 1** — `users/page.tsx`: `PageShell` + `PageHeader` (icon `UsersIcon`, title "Users"); the users table/list in a `SectionCard`; if rows are bespoke flex rows, use `ListRow`. Do NOT change the user actions or the `publicId`-keyed data (recently migrated).
- [ ] **Step 2** — `catalog/page.tsx` + `[resource]/page.tsx`: `PageHeader` (icon the catalog sidebar icon, title from the resource), editor list in `Card`/`SectionCard`. The `[resource]` editor's `publicId` DTO + actions (recently fixed) stay exactly as-is — only wrap markup.
- [ ] **Step 3: Verify + commit**
```bash
git add apps/web/app/\(dashboard\)/dashboard/users apps/web/app/\(dashboard\)/dashboard/catalog
git commit -m "feat(ds): adopt design system on users + catalog"
```

### Task 8: Dishes, Menus, Meals

**Files (modify):** `dishes/page.tsx` (+ `dishes-editor.tsx` markup), `menus/page.tsx` (+ `menu-builder.tsx` markup), `meals/page.tsx` (+ `meals-grid.tsx` markup).

- [ ] **Step 1** — `dishes/page.tsx`: `PageHeader` (icon `SaladIcon`, title "Dishes"); editor in `Card`/`SectionCard`. Keep the `publicId` DTO + actions.
- [ ] **Step 2** — `menus/page.tsx`: `PageHeader` (icon `CalendarIcon`, title "Weekly Menus"); builder grid in `SectionCard`. Keep the publicId resolution + `formatEpoch` usage.
- [ ] **Step 3** — `meals/page.tsx`: replace the existing inline icon-chip header with `PageHeader` (icon `UtensilsCrossedIcon`, title "My Meals", subtitle from the order context); replace the two empty blocks with `EmptyState`; the locked banner stays. Keep the grid + `pickDish`.
- [ ] **Step 4: Verify + commit**
```bash
git add apps/web/app/\(dashboard\)/dashboard/dishes apps/web/app/\(dashboard\)/dashboard/menus apps/web/app/\(dashboard\)/dashboard/meals
git commit -m "feat(ds): adopt design system on dishes/menus/meals"
```

### Task 9: Inquiries (list + detail + order)

**Files (modify):** `inquiries/page.tsx`, `inquiries/new-inquiry-form.tsx` (markup), `inquiries/[id]/page.tsx`, `inquiries/[id]/inquiry-controls.tsx` (markup), `inquiries/[id]/order/page.tsx`, `inquiries/[id]/order/order-form.tsx` (markup). Delete: `inquiries/stage-badge.tsx` (replaced by `ds` StageBadge).

- [ ] **Step 1** — `inquiries/page.tsx`: `PageShell` + `PageHeader` (icon the inquiries sidebar icon, title "Inquiries", subtitle a count, `actions` = the "New inquiry" trigger); add a `FilterBar` above the list with a `SearchInput` + stage `FilterPill`s (All / New / Contacted / Follow-up / Converted / Lost, with counts), and render the pipeline list as `ListRow`s with `StageBadge` trailing. If the page is currently a server component with no client filter state, the FilterBar + filtered list move into a small `"use client"` child that receives the full inquiry list as props and filters/searches in-memory (NO change to what data is loaded server-side — same rows, just client-side filter/search UI). Keep the existing data loading + actions.
- [ ] **Step 2** — swap all imports of `./stage-badge` / `../stage-badge` to `@/components/ds` `StageBadge`, then delete `inquiries/stage-badge.tsx`. (Grep `rg -n "stage-badge" apps/web` — update every importer.)
- [ ] **Step 3** — `inquiries/[id]/page.tsx`: `PageHeader` (title = inquiry name, `breadcrumbOverrides={{ [inquiry.publicId]: inquiry.fullName }}`); detail + timeline in `SectionCard`s; activity rows as `ListRow`; the `formatEpoch` activity time (recently wired) stays.
- [ ] **Step 4** — `inquiries/[id]/order/page.tsx`: `PageHeader` (title "New order", `breadcrumbOverrides` for the inquiry id segment); the agent order form wrapped in a `SectionCard`. Keep the form + `createOrder` flow.
- [ ] **Step 5: Verify + commit**
```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries
git commit -m "feat(ds): adopt design system across inquiries CRM pages"
```

### Task 10: Final verification + sweep

- [ ] **Step 1: Full verify** — from repo root: `pnpm typecheck` clean; `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm test` all green (the suite is unchanged by presentation work — confirm no regressions); `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build` green with every dashboard route present.
- [ ] **Step 2: Sweep** — `rg -n "className=\"ln" apps/web/app/\(dashboard\)` → empty (no bespoke `ln` headings remain on the dashboard); `rg -n "gradient-text|card-glow|hover-lift|icon-pop" apps/web/app/\(dashboard\)` → empty (those classes now live only inside `ds/`); confirm `inquiries/stage-badge.tsx` is deleted and nothing imports it (`rg -n "inquiries/stage-badge"` empty).
- [ ] **Step 3: Reseed** — `cd apps/web && for s in db:seed db:seed:catalog db:seed:menu db:seed:admin; do DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm $s; done`.
- [ ] **Step 4: Commit** (only if the sweep required cleanup)
```bash
git add -A
git commit -m "chore(ds): final dashboard design-system sweep"
```

---

## Self-review notes

- **Spec coverage:** `ds/` header/card inventory → Tasks 1–3; list/filter controls (FilterPill/SearchInput/FilterBar/Tabs/Pagination) → Task 4; semantic tokens → Task 1; auto breadcrumbs + route-labels → Task 2; showcase `/dashboard/design` → Task 5; rollout to all dashboard pages → Tasks 6–9 (inquiries list uses the FilterBar in Task 9); testing (pure-logic node unit tests: card variant, breadcrumb derivation, stage variant, pageRange) → Tasks 1–4; verification sweep (no `ln`/raw classes outside `ds/`) → Task 10.
- **No new test infra:** vitest stays node-env; only pure functions are unit-tested; presentational components are verified by typecheck + build + the showcase. This is deliberate (YAGNI) — adding jsdom/RTL is out of scope.
- **Presentation-only guarantee:** Tasks 5–8 change markup only; the existing suite (which is service/action/DB tests) must stay green untouched. If a page retrofit would require changing a test, that signals an accidental behavior change — stop and reconsider.
- **Type consistency:** `Card`/`cardVariantClass` (Task 1), `deriveBreadcrumbs`/`Breadcrumbs`/`PageHeader`/`PageShell` (Task 2), `StatCard`/`SectionCard`/`ListRow`/`EmptyState`/`StageBadge`/`stageVariant` (Task 3), `FilterPill`/`SearchInput`/`FilterBar`/`Tabs`/`Pagination`/`pageRange` (Task 4) are imported via the `@/components/ds` barrel in Tasks 5–9 with the exact prop names defined here.
- **Recently-migrated code is untouched:** the dual-id `publicId` DTOs, `pickDish` ownership, `formatEpoch` wiring, and service calls are preserved verbatim during retrofits — only surrounding markup changes.
