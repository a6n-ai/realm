# Plan — Loading Skeleton Audit & Fix (Dashboard / CRM)

Grounded against code 2026-06-28. Scope: every `loading.tsx` under `apps/web/app/(dashboard)/dashboard/` and the pages they should mirror.

## TL;DR

- **All 4 existing skeletons mismatch their page.** Each is "PageHeader + a few generic `h-12` bars"; the real pages have header *actions*, stat-card rows, filter bars, and structured tables. Layout shift on every load.
- **~15 async pages have no skeleton at all.**
- Root cause is the pattern, not the 4 files: skeletons are hand-rolled per page with no shared building blocks, so they drift the instant a page gains a toolbar or stat row.
- **Fix = build ~6 composable skeleton primitives once, then place `loading.tsx` at parent segments** so one file covers a whole group. Net new files stay small (~10) for full coverage.

---

## Phase 0 — Shared skeleton primitives (do first; everything else composes these)

New file `apps/web/components/ds/skeletons.tsx` (co-located with `PageHeader`/`SectionCard`/`FilterBar`/`Table`). Each mirrors the real DS component's geometry so there's zero shift.

| Primitive | Props | Mirrors |
|-----------|-------|---------|
| `SkeletonPageHeader` | `action?: boolean` | `PageHeader` — title line + optional right-aligned button block |
| `SkeletonStatCards` | `count` | the `grid gap-4 sm:grid-cols-2 lg:grid-cols-4` stat row |
| `SkeletonFilterBar` | `pills?: number, dropdown?: boolean` | `FilterBar` — search input + N pills + optional owner dropdown |
| `SkeletonTable` | `columns, rows = 8` | `Table` — header row (N) + `rows` × N body cells |
| `SkeletonListRows` | `rows` | vertical `ListRow` lists (activity, dishes, customer-360 sections) |
| `SkeletonCardGrid` | `count` | `MenuHistoryCard`/catalog card grid |

All built on the existing `Skeleton` primitive (`components/ui/skeleton.tsx`). One render test (`skeletons.test.tsx`) asserting column/row/card counts render — the only logic worth a check.

> ponytail: no per-page bespoke skeletons. If two pages differ only in column count, that's a prop, not a new component.

---

## Phase 1 — Fix the 4 existing mismatched skeletons

Each currently: `PageHeader (no action)` + `SectionCard` + 8× `h-12` bars. Rewrite to compose Phase-0 primitives.

| File | Real layout to mirror | New skeleton |
|------|----------------------|--------------|
| `dashboard/loading.tsx` | PageHeader + **4** stat cards (`sm:grid-cols-2 lg:grid-cols-4`) + SectionCard "Recent orders" table (5 cols) | `SkeletonPageHeader` + `SkeletonStatCards count={4}` + SectionCard + `SkeletonTable columns={5}` |
| `customers/loading.tsx` | PageHeader **+ "New customer"** + SectionCard + FilterBar (search) + table **5 cols** | header `action` + FilterBar + `SkeletonTable columns={5}` |
| `inquiries/loading.tsx` | PageHeader **+ "New inquiry"** + **3** stat cards + FilterBar (search + **7** stage pills + owner dropdown) + table **8 cols** | header `action` + `SkeletonStatCards count={3}` + `SkeletonFilterBar pills={7} dropdown` + `SkeletonTable columns={8}` |
| `orders/loading.tsx` | PageHeader **+ "New order"** + FilterBar (search + **6** status pills) + table **8 cols** | header `action` + `SkeletonFilterBar pills={6}` + `SkeletonTable columns={8}` |

---

## Phase 2 — Parent-segment skeletons for grouped pages (biggest coverage/file ratio)

Layouts render outside the Suspense boundary, so nav/tabs chrome stays painted; the skeleton only fills the content slot.

| New file | Covers | Renders |
|----------|--------|---------|
| `account/loading.tsx` | 7 pages: profile, contact, address, dietary, delivery-notes, notifications, security | one `SectionCard` with ~5 form-field skeleton lines (layout already paints `AccountNav`) |
| `settings/loading.tsx` | 5 pages: general, lead-assignment, lead-sources, meal-types, wallet | `SectionCard` + form-field/table skeleton (layout paints `SettingsTabs`) |
| `settings/discounts/loading.tsx` | 3 pages: coupons, kinds, rep-allowance | `SectionCard` + table-or-form skeleton (layout paints `DiscountsTabs`) |

Redirect pages (`settings/`, `settings/discounts/`, `account/` index) render nothing — these skeletons never show for them, no collision.

---

## Phase 3 — CRM detail + remaining list pages (new `loading.tsx` each)

| New file | Layout | Skeleton |
|----------|--------|----------|
| `customers/[id]/loading.tsx` | detail header + 4 SectionCards (Profile text, Orders, Inquiries, Activity lists) | header + 1 text card + 3× SectionCard with `SkeletonListRows` (8/5/6) |
| `inquiries/[id]/loading.tsx` | detail header + Details card + Activity card | header + Details card (4–5 lines) + Activity (`SkeletonListRows rows={8}`) |
| `orders/[id]/loading.tsx` | detail header + Summary + Lifecycle + Coming-week meals table + Activity | header + Summary (5 lines) + Lifecycle buttons + `SkeletonTable` (7 day rows) + `SkeletonListRows` |
| `users/loading.tsx` | SectionCard + table 3 cols (Contact, Role, Flags) | header + `SkeletonTable columns={3} rows={10}` |
| `catalog/[resource]/loading.tsx` | SectionCard + toolbar (count + Add) + dynamic-col table | header + toolbar + `SkeletonTable` (default cols) |
| `dishes/loading.tsx` | SectionCard + "Add dish" + vertical dish list | header + `SkeletonListRows rows={8}` |
| `meals/loading.tsx` | conditional; worst case = meals grid table | header + `SkeletonTable` (7 day rows) |
| `menus/loading.tsx` | Menu builder form + Past menus card grid | header + form-field skeleton + `SkeletonCardGrid count={3}` |

**Skip `catalog/loading.tsx`** — `catalog/page.tsx` is static (no async fetch), renders instantly. A skeleton there is pure waste.

---

## Sequencing

1. **Phase 0** primitives + test — unblocks all.
2. **Phase 1** (4 fixes) — highest-visibility regressions, most-used pages.
3. **Phase 2** (3 parent files) — 15 pages covered cheaply.
4. **Phase 3** (8 detail/list files) — diminishing returns; CRM `[id]` detail pages first (highest async latency), `menus`/`meals` last.

## Verification per file

Open page with network throttled (or a forced `await sleep` in the loader during dev) → skeleton shape matches the loaded layout with no jump: same header/action, same stat-card count, same filter row, same column count. The Phase-0 render test guards counts; visual parity is a manual throttled-load check.

## Out of scope

- Animating skeleton→content transitions.
- `catalog/` index (static).
- `settings/wallet/` standalone skeleton — covered by `settings/loading.tsx`; not worth its own segment file.
