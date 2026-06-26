# Slot Reconcile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** One slot system. `mealSlots` table (via `mealSlotsService`) is the single source of meal slots, now scoped per `planType`. `app_settings.mealTypes` keeps only theme (accent + titlePrefix). Weekly menu, catalog `offeredSlots`, and the Settings page all read slots from `mealSlotsService.forPlanType(planType)`. Remove the standalone "Meal slots" settings page.

**Architecture:** Add `planType` to `meal_slots`; key uniqueness becomes `(plan_type, key)`. `mealSlotsService.forPlanType(pt)` returns that type's enabled slots; `enabledSlots()` returns the deduped union (subscribe universe, unchanged behaviour). `mealTypes` config shrinks to `{ accent, titlePrefix }`. Subscribe is untouched — the wizard intersects `enabledSlots ∩ plan.offeredSlots`, and `offeredSlots` already derives per type.

**Tech:** Next.js 16, Drizzle, `@tiffin/commons{,-drizzle}`, Zod, Vitest (live Postgres).

## Global Constraints
- TS; no needless comments; `rg`/`fd`.
- Entity writes via commons services (subclass+override); raw bulk update only with a documented reason.
- Typed admin controls; no text effects; epoch-ms; commit msgs plain, NO Co-Authored-By.
- Migrations: `pnpm --filter web db:generate` → incremental SQL; baseline `next_id()` untouched.
- Tests: live Postgres (`DATABASE_URL` default `postgres://lawbringr@localhost:5432/tiffin`); per-file `reset()` deletes only its tables; never blanket-delete users; top-of-file `vi.mock("@/lib/auth", () => ({ auth: async () => null }))`.
- Run one test: `pnpm --filter web exec vitest run <path>`. Typecheck: `pnpm --filter web exec tsc --noEmit` (unrelated pre-existing errors OK; touched files must be clean).
- Subscribe flow (`/subscribe`, `components/wizard/*`) MUST keep working — do NOT change it; only verify.

## File Structure
- `apps/web/db/schema/menu.ts` — MODIFY mealSlots (planType + composite unique).
- `apps/web/db/migrations/<gen>.sql` — CREATE.
- `apps/web/lib/menu/meal-types.ts` — MODIFY (MealTypeConfig = theme only).
- `apps/web/lib/services/meal-slots.service.ts` — MODIFY (forPlanType, dedup enabledSlots).
- `apps/web/lib/services/app-settings.service.ts` — MODIFY (mealTypes theme-only).
- `apps/web/lib/services/menu.service.ts` — MODIFY (slots from forPlanType).
- `apps/web/lib/catalog/load.ts` — MODIFY (offeredSlots from forPlanType).
- `apps/web/db/seed-menu.ts` — MODIFY (per-type slot rows).
- `apps/web/app/(dashboard)/dashboard/menus/page.tsx` + `menu-builder.tsx` — MODIFY (slots prop from forPlanType).
- `apps/web/app/(dashboard)/dashboard/settings/{page,actions,meal-types-form}.tsx` — MODIFY (slot CRUD via service + theme).
- `apps/web/app/(dashboard)/dashboard/settings/meal-slots/**` — DELETE (old page).
- `apps/web/components/ds/route-labels.ts` — MODIFY (drop meal-slots label).
- Tests alongside services.

---

## Task 1: Schema — mealSlots.planType + composite unique; mealTypes theme-only

**Files:** Modify `apps/web/db/schema/menu.ts`, `apps/web/lib/menu/meal-types.ts`

**Interfaces produced:**
- `meal_slots.plan_type` (plan_type enum, default 'tiffin'); unique `(plan_type, key)` named `meal_slots_type_key_unique`; old `key` unique dropped.
- `MealTypeConfig = { accent: string; titlePrefix: string }`; `MealTypesSettings = Record<PlanType, MealTypeConfig>`; `DEFAULT_MEAL_TYPES` theme-only; `parseMealTypes` validates theme only; `MealSlot` type stays (`{ key, label }`).

- [ ] **Step 1: menu.ts** — import `planType` from `./catalog` (already imported in this file). Change `mealSlots`:
```ts
export const mealSlots = pgTable(
  "meal_slots",
  {
    ...updatableColumns("slt"),
    planType: planType("plan_type").notNull().default("tiffin"),
    key: text("key").notNull(),
    label: text("label").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("meal_slots_type_key_unique").on(t.planType, t.key)],
);
```
(`uniqueIndex` is already imported in menu.ts.)

- [ ] **Step 2: meal-types.ts** — drop `slots` from the config. New shapes:
```ts
const configSchema = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  titlePrefix: z.string().min(1),
});
export const mealTypesSchema = z.object({ tiffin: configSchema, healthy: configSchema });
export type MealTypeConfig = z.infer<typeof configSchema>;
export type MealTypesSettings = Record<PlanType, MealTypeConfig>;
export const DEFAULT_MEAL_TYPES: MealTypesSettings = {
  tiffin: { accent: "#F0820A", titlePrefix: "Tiffin Menu" },
  healthy: { accent: "#1FAE54", titlePrefix: "Healthy Menu" },
};
```
Keep `PLAN_TYPES`, `PlanType`, `MealSlot` (`{ key: string; label: string }`), `parseMealTypes` (returns the theme config).

- [ ] **Step 3:** `pnpm --filter web exec tsc --noEmit` — expect errors ONLY in files that consumed `mealTypes[...].slots` (menu.service, app-settings, catalog/load, settings form, menus page/builder). Those are fixed in later tasks. Confirm `menu.ts`/`meal-types.ts` themselves compile. Note the breakages for the controller.

- [ ] **Step 4: Commit** `git add apps/web/db/schema/menu.ts apps/web/lib/menu/meal-types.ts && git commit -m "feat(slots): plan_type on meal_slots; mealTypes config is theme-only"`

> Cross-task note: Task 1 intentionally breaks the build until Tasks 4–9 land. Reviewer: do not treat the cross-file type errors as Task 1 defects — they are expected and tracked.

---

## Task 2: Migration

**Files:** Create `apps/web/db/migrations/<gen>.sql`

- [ ] **Step 1:** `pnpm --filter web db:generate`. Expect: add `plan_type` (default 'tiffin' NOT NULL) to `meal_slots`, drop old key unique, create `meal_slots_type_key_unique`.
- [ ] **Step 2:** Inspect the generated SQL. Ensure the OLD key unique (constraint or index — check the baseline for its name, likely `meal_slots_key_unique`) is dropped and the composite is created. If the drop is missing add:
```sql
ALTER TABLE "meal_slots" DROP CONSTRAINT IF EXISTS "meal_slots_key_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "meal_slots_key_unique";--> statement-breakpoint
```
Existing rows backfill to 'tiffin' via the column default — fine; Task 7's seed assigns healthy rows.
- [ ] **Step 3:** `pnpm --filter web db:migrate` (DATABASE_URL default if unset). Verify with `psql "$DATABASE_URL" -c "\d meal_slots"`: `plan_type` + `meal_slots_type_key_unique`, no old key unique.
- [ ] **Step 4: Commit** `git add apps/web/db/migrations && git commit -m "feat(slots): migration for meal_slots.plan_type + composite unique"`

---

## Task 3: mealSlotsService.forPlanType + deduped enabledSlots

**Files:** Modify `apps/web/lib/services/meal-slots.service.ts`; Test `apps/web/lib/services/__tests__/meal-slots.service.test.ts` (file exists — extend).

**Interfaces produced:**
- `mealSlotsService.forPlanType(planType: "tiffin"|"healthy"): Promise<{ key: string; label: string; sortOrder: number }[]>` — enabled slots for that type, `asc(sortOrder)`.
- `mealSlotsService.enabledSlots()` — unchanged signature, but **deduped by key** (union across types; first by sortOrder). Keep for subscribe/catalog/api.

- [ ] **Step 1: Failing test** — add cases:
```ts
it("forPlanType returns only that type's enabled slots, ordered", async () => {
  await db.insert(mealSlots).values([
    { planType: "tiffin", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
    { planType: "healthy", key: "breakfast", label: "Breakfast", enabled: true, sortOrder: 0 },
    { planType: "healthy", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
    { planType: "healthy", key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 },
  ]);
  expect((await mealSlotsService.forPlanType("tiffin")).map((s) => s.key)).toEqual(["lunch"]);
  expect((await mealSlotsService.forPlanType("healthy")).map((s) => s.key)).toEqual(["breakfast", "lunch"]);
});
it("enabledSlots dedupes by key across types", async () => {
  await db.insert(mealSlots).values([
    { planType: "tiffin", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
    { planType: "healthy", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
    { planType: "healthy", key: "breakfast", label: "Breakfast", enabled: true, sortOrder: 0 },
  ]);
  const keys = (await mealSlotsService.enabledSlots()).map((s) => s.key);
  expect(keys).toEqual([...new Set(keys)]); // no dupes
  expect(keys).toContain("lunch"); expect(keys).toContain("breakfast");
});
```
(Match the file's existing `reset()` — it should `db.delete(mealSlots)`; add it if missing. Use the existing top-of-file mock + imports; add `mealSlots` import.)

- [ ] **Step 2:** run → FAIL (forPlanType undefined / dup keys).
- [ ] **Step 3: Implement:**
```ts
import { planType as planTypeEnum } from "@/db/schema"; // type only; not strictly needed
// inside class:
async forPlanType(planType: "tiffin" | "healthy") {
  return db
    .select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder })
    .from(mealSlots)
    .where(and(eq(mealSlots.planType, planType), eq(mealSlots.enabled, true)))
    .orderBy(asc(mealSlots.sortOrder));
}
async enabledSlots() {
  const rows = await db
    .select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder })
    .from(mealSlots).where(eq(mealSlots.enabled, true)).orderBy(asc(mealSlots.sortOrder));
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
}
```
Add `and` to the drizzle-orm import.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(slots): mealSlotsService.forPlanType + deduped enabledSlots"`

---

## Task 4: app-settings mealTypes theme-only

**Files:** Modify `apps/web/lib/services/app-settings.service.ts`; Test `__tests__/app-settings.service.test.ts`.

- [ ] **Step 1:** Update the existing mealTypes test: the persisted/round-tripped config now has `{ accent, titlePrefix }` and NO `slots`. The invalid-config case: `setMealTypes({ tiffin: { accent: "nope", titlePrefix: "x" } } as never)` rejects.
- [ ] **Step 2:** run → FAIL (type/shape).
- [ ] **Step 3:** `getMealTypes`/`setMealTypes` bodies are unchanged (they already pass-through `parseMealTypes`); only the imported types/shape change via Task 1. Adjust any slots references. Ensure it compiles and the fallback returns the theme-only `DEFAULT_MEAL_TYPES`.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(settings): mealTypes stores theme only"`

---

## Task 5: menu.service slots from forPlanType

**Files:** Modify `apps/web/lib/services/menu.service.ts`; Test `__tests__/menu.service.test.ts`.

**Behaviour:** `getPublishedWeek` returns `slots` from `mealSlotsService.forPlanType(planType)` and `theme` from `getMealTypes()[planType]`. `addItem` validates the slot against `forPlanType(planType)` keys.

- [ ] **Step 1: Failing test** — the existing tests need seeded slots now. In `reset()` add `db.delete(mealSlots)`; before slot-dependent cases insert `{ planType:"tiffin", key:"lunch", label:"Lunch", enabled:true, sortOrder:1 }`. Keep assertions: addItem rejects `dinner` for tiffin (no such enabled tiffin slot), accepts `lunch`; `getPublishedWeek().slots` keys == `["lunch"]`. Import `mealSlots`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement:**
  - import `mealSlotsService` from `./meal-slots.service`.
  - In `addItem`: replace the `getMealTypes()[planType].slots` check with:
    ```ts
    const allowed = new Set((await mealSlotsService.forPlanType(week.planType as PlanType)).map((s) => s.key));
    ```
  - In `getPublishedWeek`: `const slots = await mealSlotsService.forPlanType(planType);` and `const cfg = (await getMealTypes())[planType];` → return `theme: { accent: cfg.accent, titlePrefix: cfg.titlePrefix }, slots, items`.
  - Drop now-unused destructuring of `cfg.slots`.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(menu): menu.service slots from mealSlotsService.forPlanType"`

---

## Task 6: catalog offeredSlots from forPlanType

**Files:** Modify `apps/web/lib/catalog/load.ts`; Test `lib/catalog/__tests__/offered-slots.test.ts`.

- [ ] **Step 1: Update test** — instead of `setMealTypes(... slots ...)`, seed `mealSlots` rows for `healthy` (e.g. lunch+dinner enabled) and assert the snapshot's healthy plan `offeredSlots` equals those keys. Evict the catalog cache first (`invalidateCatalogSnapshot`) and `mealSlots` deletes in setup.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** — in `fetchCatalogSnapshot`, replace `getMealTypes()` slot derivation with per-type slots. Since plans have mixed types, fetch both:
```ts
import { mealSlotsService } from "@/lib/services/meal-slots.service";
const [tiffinSlots, healthySlots] = await Promise.all([mealSlotsService.forPlanType("tiffin"), mealSlotsService.forPlanType("healthy")]);
const slotKeys = { tiffin: tiffinSlots.map((s) => s.key), healthy: healthySlots.map((s) => s.key) };
// in plans.map: offeredSlots: slotKeys[p.planType as "tiffin" | "healthy"],
```
Remove the `getMealTypes()` import/use here.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(catalog): offeredSlots from mealSlotsService.forPlanType"`

---

## Task 7: Seed per-type slots

**Files:** Modify `apps/web/db/seed-menu.ts`

- [ ] **Step 1:** Replace `SLOTS` with per-type rows and a composite conflict target:
```ts
const SLOTS = [
  { planType: "tiffin" as const, key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
  { planType: "healthy" as const, key: "breakfast", label: "Breakfast", enabled: true, sortOrder: 0 },
  { planType: "healthy" as const, key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
  { planType: "healthy" as const, key: "dinner", label: "Dinner", enabled: true, sortOrder: 2 },
];
for (const s of SLOTS) {
  await db.insert(mealSlots).values(s).onConflictDoNothing({ target: [mealSlots.planType, mealSlots.key] });
}
```
- [ ] **Step 2:** `pnpm --filter web db:seed:menu` → exits 0. `psql` check: `select plan_type,key,enabled from meal_slots order by plan_type,sort_order;` shows tiffin/lunch + healthy/breakfast,lunch,dinner.
- [ ] **Step 3: Commit** `git commit -m "chore(slots): seed meal_slots per plan type"`

---

## Task 8: Settings — slot CRUD via service + theme; remove old page

**Files:** Modify `apps/web/app/(dashboard)/dashboard/settings/{page.tsx,actions.ts,meal-types-form.tsx}`; DELETE `apps/web/app/(dashboard)/dashboard/settings/meal-slots/`; Modify `apps/web/components/ds/route-labels.ts`.

**Interfaces produced (settings actions.ts):**
- `saveMealTypes(cfg)` — keep (theme-only now; still invalidates catalog snapshot).
- `saveSlot(input: { id: string | null; planType: PlanType; key: string; label: string; enabled: boolean; sortOrder: number })` — create/update via `mealSlotsService`.
- `deleteSlot(id: string)` — `mealSlotsService.delete(id)`.
All `requireAdmin`; `revalidatePath("/dashboard/settings")`, `/menu/weekly`, `/`, and `invalidateCatalogSnapshot()`.

- [ ] **Step 1: actions.ts** — keep `saveMealTypes`; add `saveSlot`/`deleteSlot` using `mealSlotsService` (import from `@/lib/services/meal-slots.service`). saveSlot: `id ? update(id, {planType,key,label,enabled,sortOrder}) : create({...})`.
- [ ] **Step 2: page.tsx** — load slots per type: `const [tiffinSlots, healthySlots] = await Promise.all([mealSlotsService.forPlanTypeAll?...])`. Add a service reader that returns ALL slots (incl disabled) per type for the editor: add `mealSlotsService.allForPlanType(pt)` (no enabled filter) in Task 3's service (add it there — update Task 3 if needed) OR query inline in the page. Simplest: query inline:
```ts
import { db } from "@/db/client";
import { mealSlots } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
const allSlots = await db.select({ id: mealSlots.publicId, planType: mealSlots.planType, key: mealSlots.key, label: mealSlots.label, enabled: mealSlots.enabled, sortOrder: mealSlots.sortOrder }).from(mealSlots).orderBy(asc(mealSlots.sortOrder));
```
Pass `mealTypes` + `slots={allSlots}` to `MealTypesForm`. Remove the "Meal slots" entry from the `SETTINGS` array.
- [ ] **Step 3: meal-types-form.tsx** — revamp: per `PLAN_TYPES`, render theme inputs (accent + titlePrefix → `saveMealTypes`) AND a slot editor for that type (list slots filtered by planType: key, label, enabled toggle, sortOrder; add/edit via `saveSlot`, remove via `deleteSlot`). Typed controls; key is a constrained identifier text input. After each slot action call `router.refresh()`.
- [ ] **Step 4: Delete old page** — `git rm -r "apps/web/app/(dashboard)/dashboard/settings/meal-slots"`. In `route-labels.ts` remove the `"meal-slots": "Meal slots"` entry.
- [ ] **Step 5:** `pnpm --filter web exec tsc --noEmit` clean (touched files).
- [ ] **Step 6: Commit** `git commit -m "feat(settings): manage slots per plan type via mealSlotsService; remove standalone meal-slots page"`

---

## Task 9: Menu builder/page/poster use forPlanType slots

**Files:** Modify `apps/web/app/(dashboard)/dashboard/menus/page.tsx`, `menu-builder.tsx`.

**Context:** `mealType` prop currently carries `.slots`. Now slots come separately. Builder/poster already accept a `slots`/`mealType.slots` shape — update to receive `slots: { key; label }[]` from the page via `mealSlotsService.forPlanType(planType)`; theme (`accent`, `titlePrefix`) from `getMealTypes()[planType]`.

- [ ] **Step 1: page.tsx** — load `const slots = await mealSlotsService.forPlanType(planType);` and `const theme = mealTypes[planType];`. Pass `mealType={{ ...theme, slots }}` to `MenuBuilder` (so the builder's `mealType.slots` keeps working with minimal change), OR pass `slots` + `theme` separately. Pick the smaller diff: keep `MenuBuilder`'s `mealType: { slots, accent, titlePrefix }` shape by composing `{ ...theme, slots }`.
- [ ] **Step 2:** Builder unchanged if it reads `mealType.slots/accent/titlePrefix`. Verify `WeeklyMenuPoster` still gets `slots={mealType.slots}`. The `MenuHistoryCard`/`listWeekMenus` slots: `menu.service.listWeekMenus` currently uses `getMealTypes()[planType].slots` — update it to `mealSlotsService.forPlanType(planType)` (slots) too (it returns `slots` in each week). Fix that in menu.service (fold into Task 5 if the implementer is the same; otherwise here).
- [ ] **Step 3:** `pnpm --filter web exec tsc --noEmit` clean.
- [ ] **Step 4: Commit** `git commit -m "feat(menu): builder/poster/history slots from mealSlotsService.forPlanType"`

---

## Task 10: Verify

- [ ] **Step 1:** `pnpm --filter web exec tsc --noEmit` — fully clean.
- [ ] **Step 2:** Run the touched suites: `pnpm --filter web exec vitest run lib/services/__tests__/meal-slots.service.test.ts lib/services/__tests__/menu.service.test.ts lib/services/__tests__/app-settings.service.test.ts lib/catalog/__tests__/offered-slots.test.ts lib/menu/__tests__/poster.test.ts` — all green.
- [ ] **Step 3:** Sanity: `pnpm --filter web exec vitest run lib/services/__tests__/orders.service.test.ts lib/services/__tests__/order-slots.test.ts` — ordering path still green.
- [ ] **Step 4:** Commit any fixes.

## Self-Review
- mealSlots planType + composite unique (T1,T2); service forPlanType + dedup (T3); mealTypes theme-only (T1,T4); menu slots from service (T5,T9); catalog offered from service (T6); seed (T7); settings CRUD + old page removed (T8); subscribe untouched + verified (T10). Migration safe (default backfill). Tests cover service, menu, catalog, ordering sanity.
