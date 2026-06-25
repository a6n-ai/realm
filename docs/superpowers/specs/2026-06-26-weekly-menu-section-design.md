# Weekly Menu Section — Design

**Date:** 2026-06-26
**Status:** Approved (pending written-spec review)
**Author:** brainstormed with hrithikraj1997@gmail.com

## Problem

Tiffin Grab publishes a weekly tiffin menu as a Canva PDF poster
(see `tiffingrab.ca/.../Tiffin-Menu-*.pdf`). The poster format is:

- Title: `Tiffin Menu - <start date> - <end date>` (one week).
- Six columns: **Mon, Tue, Wed, Thu, Fri** + **WEEKENDS** (Sat+Sun merged).
- Each weekday lists **3 dishes** (flat list of names); weekends list **2**.
- Dishes mix veg/nonveg. No lunch/dinner slots, no portions, no per-dish detail.

The existing in-app menu (`/dashboard/menus`, `menu.ts`) over-models this: it
has meal *slots* (lunch/dinner), `isDefault`, per-person `meal_selections`, and
order cutoffs — none of which appear in the real weekly poster. It does not
match how the business actually publishes menus.

We want an in-app **weekly menu section** that (a) lets admins build the week's
poster matching the real format, (b) supports **multiple plans** (Tiffin now,
Healthy later), (c) publishes the poster to the **marketing website** (homepage
+ dedicated route), and (d) supports **PDF download**. Built so customer
**ordering** can attach in a later phase without rework.

## Scope

**Phase 1 (this spec):** Admin builds + publishes weekly menus per plan;
poster renders on marketing site; PDF download; customizable plan settings.

**Phase 2 (later, not built now):** Customers order/select dishes off a
released week, feeding `meal_selections` + order cutoff. Schema is designed so
this attaches cleanly.

**Out of scope:** Nutrition/calorie data, the "Healthy" plan's content,
pixel-perfect PDF rendering (phase-1 PDF = browser print of the poster).

## Decisions

- **Approach A — extend menu tables, add a Plan dimension.** Rejected: separate
  poster tables (double maintenance) and JSON-blob-per-week (breaks phase-2
  ordering, which needs real `dish_id` rows).
- **Marketing placement:** current-week poster on the **homepage** *and* a
  **dedicated route**.
- **Old slot-based builder:** **replaced** by the poster-style builder. Existing
  `menu_weeks`/`menu_items` data is backfilled into the seeded "Tiffin" plan so
  nothing is orphaned (required by the new NOT NULL `plan_id`).
- **PDF:** phase 1 = print-CSS on the poster + "Download PDF" via browser print
  (zero deps). `@react-pdf/renderer` deferred until pixel-perfect download is
  actually needed.

## Data model

New table `menu_plans`:

| column      | type                  | notes                                  |
|-------------|-----------------------|----------------------------------------|
| (updatable) | `mpl` prefix          | commons `updatableColumns`             |
| `key`       | text unique           | `tiffin`, `healthy`, …                 |
| `label`     | text                  | display name                           |
| `active`    | boolean default true  | hide a plan without deleting           |
| `sortOrder` | integer default 0     | ordering in pickers / marketing        |
| `config`    | jsonb                 | see below                              |

`config` shape (typed, validated):

```ts
type PlanConfig = {
  columns: { label: string; days: DayOfWeek[]; dishCount: number }[];
  theme: { accent: string; titlePrefix: string };
};
```

Tiffin default `config`:

```ts
{
  columns: [
    { label: "Monday",   days: ["mon"], dishCount: 3 },
    { label: "Tuesday",  days: ["tue"], dishCount: 3 },
    { label: "Wednesday",days: ["wed"], dishCount: 3 },
    { label: "Thursday", days: ["thu"], dishCount: 3 },
    { label: "Friday",   days: ["fri"], dishCount: 3 },
    { label: "Weekends", days: ["sat","sun"], dishCount: 2 },
  ],
  theme: { accent: "#F0820A", titlePrefix: "Tiffin Menu" },
}
```

`dishCount` is **soft guidance** (UI nudges, doesn't hard-block) — admins can
add fewer/more without an error.

Changes to existing tables:

- `menu_weeks` += `planId bigint NOT NULL REFERENCES menu_plans(id)`. Unique
  constraint changes from `weekStart` to **`(plan_id, week_start)`**.
- `menu_items` += `position integer NOT NULL DEFAULT 0` (poster ordering within a
  column). `slot` stays in the schema but the builder writes a single implicit
  slot value `"main"` for poster-only plans, keeping phase-2 keys clean.
- `meal_selections`: **unchanged** (phase 2). Weekend dishes are stored under
  `sat`; phase-2 weekend selection maps both sat+sun to the merged column's
  dishes (documented for the phase-2 implementer).

**Migration:** Drizzle `db:generate` (squashed baseline convention). Seed a
`tiffin` plan; backfill any existing `menu_weeks.plan_id` to it before the NOT
NULL constraint applies.

## Services

`menu.service.ts` (extends commons abstract services, subclass overrides per
convention):

- Plan CRUD via a `MenuPlansService` (commons `UpdatableRepository`); `config`
  validated against a Zod/typed schema before write.
- Week + items: keep `upsertWeek`/`addItem`/`removeItem`/`weekWithItems`,
  re-scoped by `planId`; add `reorderItems(weekId, day, orderedIds)` writing
  `position`; `release` unchanged.
- A cached `getPublishedWeek(planKey, weekStart?)` for marketing (TieredCache,
  evict on release — mirrors `app-settings.service` and the catalog snapshot
  cache). Returns the current released week's poster data.

## UI

**Admin `/dashboard/menus` (rebuilt, poster-style):**

- Plan picker (typed `Select`) → week picker / "new week" (date input, Monday).
- One card per `config.columns` entry. Each card: dish list with veg/nonveg dot,
  add-dish (typed `Select` from active dishes — no free-text, TD-3), remove,
  drag-reorder (writes `position`). Soft count hint from `dishCount`.
- Draft → **Release** action.
- **Live poster preview** mirroring the marketing render (pattern from the
  catalog live-preview commit `7dda875`).
- **Settings** panel for plan `config`: columns (label/days/count), theme
  (accent color, title prefix) — all typed controls.

**Marketing:**

- New `WeeklyMenuPoster` component (orange Canva look: brand header, day
  columns, dish lists, footer with phone/site). Solid colors only — no text
  effects (per `no-text-effects` memory).
- Rendered on **homepage** (section) and a **dedicated route**
  (`/menu/weekly`), both reading `getPublishedWeek("tiffin")`. Static + ISR /
  revalidate-on-release (matches `/menu` page caching).
- **Download PDF** button → print-CSS poster via browser print.

## Error handling

- Plan `config` validated before persist; invalid JSON rejected with
  `ValidationError`.
- Releasing a week with empty columns warns but is allowed (admin choice).
- Marketing render: no released week → graceful "menu coming soon" empty state,
  not a crash.
- Admin actions are `requireAdmin`-guarded server actions (existing pattern),
  `revalidatePath` on marketing + dashboard.

## Testing

- Service tests against the live seeded Postgres (harness convention,
  `live-db-test-harness`): plan CRUD + config validation; week scoped by plan;
  reorder writes `position`; `getPublishedWeek` returns released-only and is
  cache-evicted on release; weekend-day storage.
- Backfill migration: existing weeks land on the tiffin plan.
- Marketing: empty-state when no released week.

## Phase-2 readiness (not built)

`meal_selections` + cutoff already model ordering. A released week's
`menu_items` (real `dish_id` rows, with `slot="main"`) are the orderable units;
weekend selection resolves both sat+sun to the merged column. No phase-1 schema
choice blocks this.
