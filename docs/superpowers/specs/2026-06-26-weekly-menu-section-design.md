# Weekly Menu Section — Design

**Date:** 2026-06-26
**Status:** v2 unified model, email descoped — **pending review**
**Author:** brainstormed with hrithikraj1997@gmail.com

## Problem

Tiffin Grab publishes a weekly menu as a Canva PDF poster
(see `tiffingrab.ca/.../Tiffin-Menu-*.pdf`):

- Title: `Tiffin Menu - <start> - <end>` (one week).
- Six columns: **Mon, Tue, Wed, Thu, Fri** + **WEEKENDS** (Sat+Sun merged).
- Each weekday lists **3 dishes** (flat names); weekends list **2**.
- Veg/nonveg mix. The tiffin poster shows **no meal slots** (it's lunch-only).

We want an in-app weekly-menu section that lets admins compose the week per
**meal type** (tiffin/healthy), publishes to the marketing site (homepage +
`/menu/weekly`), and downloads as a PDF. Built so customer **ordering** can
attach later without rework.

**Email is explicitly out of scope.** A dedicated emailing system (multiple
workflows: this-week's-order customers, inquiries, segments) is a separate
future project. No mail provider, no puppeteer, no PDF-by-email here.

## The unified plan/slot model (v2)

There is already a `plan_type` pgEnum `('tiffin','healthy')` on the catalog
`plans` table, plus `plans.offeredSlots text[]`. This enum **is** the plan
dimension. We do NOT introduce a separate plans table for the weekly menu.

- **`plan_type`** (tiffin/healthy) — kept as-is, the single plan axis.
- **Meal slots belong to a plan type**, not to the catalog. tiffin → `[lunch]`;
  healthy → `[breakfast, lunch, dinner]`.
- **Source of truth moves to Settings**: a new `app_settings.mealTypes` JSON,
  keyed by plan type, holds each type's slots + poster theme. The standalone
  catalog meal-slots editor is dropped. Catalog `plans.offeredSlots` is **derived
  from** this config at snapshot-load time (the column stays but is no longer the
  source).
- **Weekly menu is keyed by `plan_type`**; its structure (day × slots) follows
  that type's slot setting.

`app_settings.mealTypes` shape:

```ts
type MealTypeConfig = {
  slots: { key: string; label: string }[];   // ordered
  accent: string;                              // "#RRGGBB"
  titlePrefix: string;                         // e.g. "Tiffin Menu"
};
type MealTypesSettings = Record<"tiffin" | "healthy", MealTypeConfig>;
```

Defaults:

```ts
{
  tiffin:  { slots: [{ key: "lunch", label: "Lunch" }], accent: "#F0820A", titlePrefix: "Tiffin Menu" },
  healthy: { slots: [{ key: "breakfast", label: "Breakfast" }, { key: "lunch", label: "Lunch" }, { key: "dinner", label: "Dinner" }], accent: "#1FAE54", titlePrefix: "Healthy Menu" },
}
```

## Scope

**Phase 1 (this spec):** Settings panel for meal-type slots+theme; poster-style
admin builder per plan type; marketing poster (homepage + `/menu/weekly`);
react-pdf download; catalog reads slots from the new config.

**Phase 2 (later):** Customers order/select dishes off a released week
(`meal_selections` + cutoff). Schema designed so this attaches cleanly.

**Out of scope:** all email / the emailing system (separate future project);
nutrition data; expanding the `plan_type` enum (keep tiffin/healthy);
drag-reorder UI (handle deferred; `position` set by add order).

## Decisions

- **No new plans table.** Reuse `plan_type` enum. `menu_weeks` gets a `planType`
  enum column; unique becomes `(plan_type, week_start)`.
- **Meal-type config (slots + theme) in `app_settings.mealTypes` JSON**, edited
  in a Settings panel. Catalog meal-slots editor removed; `offeredSlots` derived
  from config. The existing `mealSlots` table is retired from the weekly-menu
  path (left in place to avoid migration churn; marked deprecated).
- **Poster slot rendering follows the type's slot count:** 1 slot → flat dish
  list per day (tiffin, matches the PDF, slot header hidden); >1 slot → dishes
  grouped under slot subheaders (healthy).
- **Weekends merged** (Sat+Sun) as a poster column; dishes stored under `sat`.
- **Old slot-based builder replaced** by the poster-style builder.
- **PDF — download only, via `@react-pdf/renderer`**: light, no chromium, a
  simpler branded dish-list. One concrete renderer, no abstract base (single
  impl = YAGNI). When the future emailing system adds a puppeteer brand-exact
  engine, reintroduce the `WeeklyMenuPdfRenderer` abstract seam then.
- **Marketing placement:** homepage section + dedicated `/menu/weekly` route.

## Data model

Changes:

- `db/schema/app-settings.ts`: add `mealTypes jsonb` to `app_settings`.
- `db/schema/menu.ts`:
  - `menu_weeks` += `planType` enum (`plan_type`, default `'tiffin'`); unique
    changes from `week_start` to `(plan_type, week_start)`.
  - `menu_items` += `position integer NOT NULL DEFAULT 0`. `slot` stays and now
    holds the **real** slot key from the type's config (no `"main"` placeholder).
  - `mealSlots` table: unchanged but deprecated (no longer read by the menu).
- `meal_selections`: **unchanged** (phase 2). Weekend dishes stored under `sat`;
  phase-2 weekend selection maps both sat+sun to the merged column.

**Migration:** `pnpm --filter web db:generate`, then apply. `planType` has a
default so existing rows backfill to `'tiffin'`. Seed `app_settings.mealTypes`
with the defaults above.

## Services

`app-settings.service.ts`:
- `getMealTypes(): Promise<MealTypesSettings>` (cached, defaults when unset).
- `setMealTypes(cfg: MealTypesSettings): Promise<void>` (validated; evicts cache).

`menu.service.ts` (commons subclass + override convention):
- `upsertWeek({ planType, weekStart, orderCutoff })` — scoped by `planType`.
- `addItem({ menuWeekId, dayOfWeek, slot, dishId, position })` — `slot` validated
  against the plan type's configured slots (replaces the old `mealSlots.enabled`
  check).
- `removeItem`, `reorderItems({ menuWeekId, dayOfWeek, slot, orderedItemIds })`,
  `release` (evicts published cache).
- `weekWithItems(weekPublicId)`.
- `getPublishedWeek(planType, weekStart?)` — cached; returns
  `{ planType; theme; weekStart; slots; items: PosterItem[] }` where
  `PosterItem = { dayOfWeek; slot; dishName; diet; position }`.

`catalog/load.ts`: derive each plan's `offeredSlots` from
`getMealTypes()[plan.planType].slots` (keys) instead of the column.

### Poster mapping (`lib/menu/plan-config.ts`)

Pure, tested:
- `WEEKEND_COLUMNS`/day-grouping constants (Mon…Fri + Weekends[sat,sun]).
- `buildPosterColumns(slots, items)` → `RenderedColumn[]` where each column is a
  day group, and within it either a flat dish list (1 slot) or
  `{ slotLabel, dishes }[]` subgroups (>1 slot), ordered by (day index, position).

### PDF download (`lib/menu/pdf/`)

A single function/class:

```ts
async function renderWeeklyMenuPdf(planType, weekStart?): Promise<Uint8Array> {
  const pub = await getPublishedWeek(planType, weekStart);
  if (!pub) throw new NotFoundError(...);
  return reactPdfBytes({ titlePrefix: pub.theme.titlePrefix, accent: pub.theme.accent,
    weekStart: pub.weekStart, columns: buildPosterColumns(pub.slots, pub.items) });
}
```
No abstract base now (one impl). The emailing-system project re-adds the
abstraction + a puppeteer engine when it needs brand-exact email PDFs.

## UI

**Settings → Meal types panel** (`/dashboard/settings`): per plan type, edit
ordered slots (key+label, add/remove), accent color, title prefix. Typed
controls. Saves via `setMealTypes`. Replaces the catalog meal-slots editor.

**Admin `/dashboard/menus` (rebuilt):** plan-type picker → week picker/new →
day columns; within each day, dish add per slot (single slot → flat add; multi →
one add control per slot label). Typed `Select` from active dishes. Draft →
Release. **Live poster preview** mirroring marketing.

**Marketing:** `WeeklyMenuPoster` component (brand look, solid colors only — no
text effects). Renders flat or slot-grouped per the type's slots. On homepage +
`/menu/weekly`. **Download PDF** → `/menu/weekly/pdf` (react-pdf). Empty state
when nothing released. Nav link added.

## Email — deferred to a separate project

Not built here. A future emailing system will own recipient workflows
(this-week's-order customers, inquiries, segments), a mail provider, CASL
unsubscribe, batching, and a puppeteer brand-exact PDF engine. The weekly-menu
poster route + `getPublishedWeek` are the integration points it will consume.

## New dependencies

- `@react-pdf/renderer` (download). No other new deps.

## Error handling

- `mealTypes` + slot keys validated before persist (`ValidationError`).
- `addItem` rejects a slot not in the plan type's config.
- Releasing an empty week warns but is allowed.
- Marketing render: no released week → "menu coming soon" empty state.
- Admin actions `requireAdmin`-guarded; `revalidatePath` on `/`, `/menu/weekly`,
  `/dashboard/menus`.

## Testing

- `app-settings.service`: get/set `mealTypes`, defaults, validation, cache evict
  + audit rows (live-DB template).
- `plan-config`: `buildPosterColumns` flat (1 slot) and grouped (>1 slot),
  weekend merge, position ordering.
- `menu.service`: week scoped by `planType`; `addItem` slot-validation against
  config; `reorderItems` writes position; `getPublishedWeek` released-only +
  cache-evict on release.
- `catalog/load`: `offeredSlots` derived from config.
- PDF: `renderWeeklyMenuPdf` produces a `%PDF-` byte stream for a published
  week; throws when nothing is released.

## Phase-2 readiness

`meal_selections` + cutoff already model ordering. A released week's `menu_items`
(real `dish_id`, real `slot`) are the orderable units; weekend resolves sat+sun.
No phase-1 choice blocks it.
