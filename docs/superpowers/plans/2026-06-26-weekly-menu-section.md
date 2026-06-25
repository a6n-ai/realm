# Weekly Menu Section Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins compose a weekly menu per meal type (tiffin/healthy) using that type's configured meal slots; it publishes to the marketing site (homepage + `/menu/weekly`) and downloads as a react-pdf file.

**Architecture:** No new plans table — the existing `plan_type` enum is the axis. Meal slots + poster theme per type live in `app_settings.mealTypes` (edited in Settings, source of truth; catalog `offeredSlots` derives from it). `menu_weeks` is scoped by `planType`; `menu_items` keeps a real `slot` + `position`. The poster renders flat (1 slot) or slot-grouped (>1). Ordering attaches later via the untouched `meal_selections`.

**Tech Stack:** Next.js 16, Drizzle (postgres-js), `@tiffin/commons{,-drizzle}`, Zod, `@react-pdf/renderer`, Vitest (live Postgres), shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-26-weekly-menu-section-design.md`

## Global Constraints

- TypeScript; `rg`/`fd` in shell; no unnecessary comments.
- No text effects on text anywhere — plain solid color.
- Admin editors use typed controls (select/multiselect/date), never free-text for enum/date/refs.
- Entity writes go through commons abstract services (subclass + override calling super); no raw insert/update for audited entities in services.
- Epoch-ms storage (`bigint mode:number`); cutoffs anchored to delivery TZ, DST-aware.
- Commit messages plain, NO `Co-Authored-By` trailer.
- Migrations: `pnpm --filter web db:generate` → incremental SQL under `apps/web/db/migrations`; `next_id()` preamble hand-maintained in baseline.
- Tests: integration vs live Postgres (`DATABASE_URL` default `postgres://lawbringr@localhost:5432/tiffin`); per-file `reset()` deletes only its tables; never blanket-delete users/`usr_system`; top-of-file `vi.mock("@/lib/auth", () => ({ auth: async () => null }))`.
- **Email is OUT OF SCOPE** — no mail provider, no puppeteer, no PDF-by-email.
- Run one test file: `pnpm --filter web exec vitest run <path>`. Full: `pnpm --filter web test`. Typecheck: `pnpm --filter web exec tsc --noEmit`.

---

## File Structure

- `apps/web/db/schema/menu.ts` — MODIFY: `menu_weeks.planType` enum + composite unique; `menu_items.position`.
- `apps/web/db/schema/app-settings.ts` — MODIFY: add `mealTypes jsonb`.
- `apps/web/db/migrations/<generated>.sql` — CREATE (generated; minor hand-check).
- `apps/web/lib/menu/meal-types.ts` — CREATE: `MealTypesSettings` types, Zod, defaults.
- `apps/web/lib/menu/poster.ts` — CREATE: `buildPosterColumns`, day-group constants, `PosterItem`/`RenderedColumn` types.
- `apps/web/lib/menu/__tests__/poster.test.ts` — CREATE.
- `apps/web/lib/services/app-settings.service.ts` — MODIFY: `getMealTypes`/`setMealTypes`.
- `apps/web/lib/services/__tests__/app-settings.service.test.ts` — MODIFY: add mealTypes tests.
- `apps/web/lib/services/menu.service.ts` — MODIFY: rescope by planType, slot-validate, reorder, getPublishedWeek.
- `apps/web/lib/services/__tests__/menu.service.test.ts` — MODIFY.
- `apps/web/lib/catalog/load.ts` — MODIFY: derive `offeredSlots` from mealTypes.
- `apps/web/db/seed.ts` — MODIFY: seed `mealTypes` defaults.
- `apps/web/db/seed-menu.ts` — MODIFY: set `planType` + `position`.
- `apps/web/components/marketing/weekly-menu-poster.tsx` — CREATE.
- `apps/web/app/(marketing)/menu/weekly/page.tsx` — CREATE.
- `apps/web/app/(marketing)/menu/weekly/pdf/route.ts` — CREATE.
- `apps/web/app/(marketing)/page.tsx` — MODIFY: homepage section.
- `apps/web/components/marketing/site-header.tsx` — MODIFY: nav link.
- `apps/web/lib/menu/pdf.tsx` — CREATE: `renderWeeklyMenuPdf`.
- `apps/web/lib/menu/__tests__/pdf.test.ts` — CREATE.
- `apps/web/app/(dashboard)/dashboard/settings/` — MODIFY/CREATE: meal-types panel + action.
- `apps/web/app/(dashboard)/dashboard/menus/page.tsx` — MODIFY.
- `apps/web/app/(dashboard)/dashboard/menus/menu-builder.tsx` — REWRITE.
- `apps/web/app/(dashboard)/dashboard/menus/actions.ts` — MODIFY.

---

## Task 1: Schema changes

**Files:**
- Modify: `apps/web/db/schema/menu.ts`
- Modify: `apps/web/db/schema/app-settings.ts`

**Interfaces:**
- Produces: `menu_weeks.planType` (`plan_type` enum, default `'tiffin'`); unique `(plan_type, week_start)`; `menu_items.position int NOT NULL default 0`; `app_settings.mealTypes jsonb`.

- [ ] **Step 1: menu.ts — planType on weeks, position on items**

Import the existing enum from catalog and `integer`:

```ts
import { bigint, boolean, date, integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { planType } from "./catalog";
```

Rewrite `menuWeeks` (drop `.unique()` on weekStart; add planType + composite unique):

```ts
export const menuWeeks = pgTable(
  "menu_weeks",
  {
    ...updatableColumns("mnw"),
    planType: planType("plan_type").notNull().default("tiffin"),
    weekStart: date("week_start").notNull(),
    status: menuWeekStatus("status").notNull().default("draft"),
    orderCutoff: bigint("order_cutoff", { mode: "number" }).notNull(),
    releasedAt: bigint("released_at", { mode: "number" }),
  },
  (t) => [uniqueIndex("menu_weeks_type_week_unique").on(t.planType, t.weekStart)],
);
```

Add `position` to `menuItems` after `isDefault`:

```ts
    isDefault: boolean("is_default").notNull().default(false),
    position: integer("position").notNull().default(0),
```

- [ ] **Step 2: app-settings.ts — mealTypes column**

```ts
export const appSettings = pgTable("app_settings", {
  ...updatableColumns("aps"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  cutoffHour: integer("cutoff_hour").notNull().default(18),
  leadAssignment: jsonb("lead_assignment"),
  mealTypes: jsonb("meal_types"),
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no new errors in `menu.ts`/`app-settings.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/db/schema/menu.ts apps/web/db/schema/app-settings.ts
git commit -m "feat(menu): scope weeks by plan_type, add item position + app_settings.meal_types"
```

---

## Task 2: Migration

**Files:**
- Create: `apps/web/db/migrations/<generated>.sql`

- [ ] **Step 1: Generate**

Run: `pnpm --filter web db:generate`
Expected: a new migration with `ALTER TABLE "menu_weeks" ADD COLUMN "plan_type" ... DEFAULT 'tiffin'`, the unique index swap (`week_start` → `(plan_type, week_start)`), `ALTER TABLE "menu_items" ADD COLUMN "position" integer DEFAULT 0 NOT NULL`, and `ALTER TABLE "app_settings" ADD COLUMN "meal_types" jsonb`.

- [ ] **Step 2: Verify the unique swap is present**

Open the generated file. Confirm it drops the old `menu_weeks` week_start unique (constraint or index) and creates `menu_weeks_type_week_unique`. If the drop is missing (drizzle sometimes omits renamed uniques), add at the right spot:

```sql
ALTER TABLE "menu_weeks" DROP CONSTRAINT IF EXISTS "menu_weeks_week_start_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "menu_weeks_week_start_unique";--> statement-breakpoint
```

- [ ] **Step 3: Apply**

Run: `pnpm --filter web db:migrate`
Expected: completes. `psql "$DATABASE_URL" -c "\d menu_weeks"` shows `plan_type` + the `menu_weeks_type_week_unique` index; `\d app_settings` shows `meal_types`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/db/migrations
git commit -m "feat(menu): migration for plan_type weeks, item position, app_settings.meal_types"
```

---

## Task 3: Meal-types config module

**Files:**
- Create: `apps/web/lib/menu/meal-types.ts`

**Interfaces:**
- Produces:
  - `type PlanType = "tiffin" | "healthy"`
  - `type MealSlot = { key: string; label: string }`
  - `type MealTypeConfig = { slots: MealSlot[]; accent: string; titlePrefix: string }`
  - `type MealTypesSettings = Record<PlanType, MealTypeConfig>`
  - `mealTypesSchema: ZodType<MealTypesSettings>`
  - `parseMealTypes(value: unknown): MealTypesSettings` (throws `ValidationError`)
  - `DEFAULT_MEAL_TYPES: MealTypesSettings`

- [ ] **Step 1: Implement**

```ts
// apps/web/lib/menu/meal-types.ts
import { z } from "zod";
import { ValidationError } from "@tiffin/commons";

export const PLAN_TYPES = ["tiffin", "healthy"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];
export type MealSlot = { key: string; label: string };
export type MealTypeConfig = { slots: MealSlot[]; accent: string; titlePrefix: string };
export type MealTypesSettings = Record<PlanType, MealTypeConfig>;

const slotSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, "slot key must be lowercase alphanumeric/underscore"),
  label: z.string().min(1),
});
const configSchema = z.object({
  slots: z.array(slotSchema).min(1),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  titlePrefix: z.string().min(1),
});
export const mealTypesSchema = z.object({ tiffin: configSchema, healthy: configSchema });

export function parseMealTypes(value: unknown): MealTypesSettings {
  const r = mealTypesSchema.safeParse(value);
  if (!r.success) throw new ValidationError(`Invalid meal types: ${r.error.issues[0]?.message ?? "unknown"}`);
  return r.data;
}

export const DEFAULT_MEAL_TYPES: MealTypesSettings = {
  tiffin: { slots: [{ key: "lunch", label: "Lunch" }], accent: "#F0820A", titlePrefix: "Tiffin Menu" },
  healthy: {
    slots: [
      { key: "breakfast", label: "Breakfast" },
      { key: "lunch", label: "Lunch" },
      { key: "dinner", label: "Dinner" },
    ],
    accent: "#1FAE54",
    titlePrefix: "Healthy Menu",
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/menu/meal-types.ts
git commit -m "feat(menu): meal-types config schema, defaults"
```

---

## Task 4: Poster mapping (flat vs slot-grouped)

**Files:**
- Create: `apps/web/lib/menu/poster.ts`
- Test: `apps/web/lib/menu/__tests__/poster.test.ts`

**Interfaces:**
- Consumes: `MealSlot` from `./meal-types`.
- Produces:
  - `type DayOfWeek = "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"`
  - `type PosterItem = { dayOfWeek: DayOfWeek; slot: string; dishName: string; diet: "veg"|"nonveg"; position: number }`
  - `type RenderedGroup = { slotLabel: string | null; dishes: { name: string; diet: "veg"|"nonveg" }[] }`
  - `type RenderedColumn = { label: string; groups: RenderedGroup[] }`
  - `DAY_COLUMNS: { label: string; days: DayOfWeek[] }[]` (Mon…Fri + Weekends[sat,sun])
  - `buildPosterColumns(slots: MealSlot[], items: PosterItem[]): RenderedColumn[]`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/menu/__tests__/poster.test.ts
import { describe, expect, it } from "vitest";
import { buildPosterColumns } from "../poster";

const tiffinSlots = [{ key: "lunch", label: "Lunch" }];
const healthySlots = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
];

describe("buildPosterColumns", () => {
  it("single slot => flat group (slotLabel null), weekend merged, ordered by position", () => {
    const cols = buildPosterColumns(tiffinSlots, [
      { dayOfWeek: "mon", slot: "lunch", dishName: "Dal", diet: "veg", position: 1 },
      { dayOfWeek: "mon", slot: "lunch", dishName: "Paneer", diet: "veg", position: 0 },
      { dayOfWeek: "sun", slot: "lunch", dishName: "Chicken Pasta", diet: "nonveg", position: 1 },
      { dayOfWeek: "sat", slot: "lunch", dishName: "Veg Pasta", diet: "veg", position: 0 },
    ]);
    const mon = cols.find((c) => c.label === "Monday")!;
    expect(mon.groups).toHaveLength(1);
    expect(mon.groups[0].slotLabel).toBeNull();
    expect(mon.groups[0].dishes.map((d) => d.name)).toEqual(["Paneer", "Dal"]);
    const weekend = cols.find((c) => c.label === "Weekends")!;
    expect(weekend.groups[0].dishes.map((d) => d.name)).toEqual(["Veg Pasta", "Chicken Pasta"]);
  });

  it("multi slot => one group per slot in slot order", () => {
    const cols = buildPosterColumns(healthySlots, [
      { dayOfWeek: "mon", slot: "dinner", dishName: "Soup", diet: "veg", position: 0 },
      { dayOfWeek: "mon", slot: "breakfast", dishName: "Poha", diet: "veg", position: 0 },
    ]);
    const mon = cols.find((c) => c.label === "Monday")!;
    expect(mon.groups.map((g) => g.slotLabel)).toEqual(["Breakfast", "Lunch", "Dinner"]);
    expect(mon.groups[0].dishes.map((d) => d.name)).toEqual(["Poha"]);
    expect(mon.groups[1].dishes).toEqual([]);
    expect(mon.groups[2].dishes.map((d) => d.name)).toEqual(["Soup"]);
  });
});
```

- [ ] **Step 2: Run; verify fails**

Run: `pnpm --filter web exec vitest run lib/menu/__tests__/poster.test.ts`
Expected: FAIL — cannot find `../poster`.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/menu/poster.ts
import type { MealSlot } from "./meal-types";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayOfWeek = (typeof DAYS)[number];

export type PosterItem = { dayOfWeek: DayOfWeek; slot: string; dishName: string; diet: "veg" | "nonveg"; position: number };
export type RenderedGroup = { slotLabel: string | null; dishes: { name: string; diet: "veg" | "nonveg" }[] };
export type RenderedColumn = { label: string; groups: RenderedGroup[] };

export const DAY_COLUMNS: { label: string; days: DayOfWeek[] }[] = [
  { label: "Monday", days: ["mon"] },
  { label: "Tuesday", days: ["tue"] },
  { label: "Wednesday", days: ["wed"] },
  { label: "Thursday", days: ["thu"] },
  { label: "Friday", days: ["fri"] },
  { label: "Weekends", days: ["sat", "sun"] },
];

export function buildPosterColumns(slots: MealSlot[], items: PosterItem[]): RenderedColumn[] {
  const flat = slots.length <= 1;
  return DAY_COLUMNS.map((col) => {
    const inCol = items.filter((i) => col.days.includes(i.dayOfWeek));
    const order = (a: PosterItem, b: PosterItem) =>
      col.days.indexOf(a.dayOfWeek) - col.days.indexOf(b.dayOfWeek) || a.position - b.position;
    if (flat) {
      const dishes = [...inCol].sort(order).map((i) => ({ name: i.dishName, diet: i.diet }));
      return { label: col.label, groups: [{ slotLabel: null, dishes }] };
    }
    const groups: RenderedGroup[] = slots.map((s) => ({
      slotLabel: s.label,
      dishes: inCol.filter((i) => i.slot === s.key).sort(order).map((i) => ({ name: i.dishName, diet: i.diet })),
    }));
    return { label: col.label, groups };
  });
}
```

- [ ] **Step 4: Run; verify pass**

Run: `pnpm --filter web exec vitest run lib/menu/__tests__/poster.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/menu/poster.ts apps/web/lib/menu/__tests__/poster.test.ts
git commit -m "feat(menu): poster column mapping (flat vs slot-grouped)"
```

---

## Task 5: app-settings service — getMealTypes / setMealTypes

**Files:**
- Modify: `apps/web/lib/services/app-settings.service.ts`
- Test: `apps/web/lib/services/__tests__/app-settings.service.test.ts`

**Interfaces:**
- Produces: `getMealTypes(): Promise<MealTypesSettings>` (cached, defaults when unset); `setMealTypes(cfg: MealTypesSettings): Promise<void>` (validated, evicts cache).
- Consumes: `parseMealTypes`, `DEFAULT_MEAL_TYPES`.

- [ ] **Step 1: Write failing tests (append)**

Append to `app-settings.service.test.ts` import line + a describe block. Update the imports:

```ts
const { getAppSettings, setAppSettings, getMealTypes, setMealTypes } = await import("../app-settings.service");
const { DEFAULT_MEAL_TYPES } = await import("@/lib/menu/meal-types");
```

Add:

```ts
describe("meal types", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns defaults when unset", async () => {
    expect(await getMealTypes()).toEqual(DEFAULT_MEAL_TYPES);
  });

  it("persists and reads back; rejects invalid", async () => {
    const cfg = { ...DEFAULT_MEAL_TYPES, tiffin: { ...DEFAULT_MEAL_TYPES.tiffin, titlePrefix: "Tiffin Specials" } };
    await setMealTypes(cfg);
    expect((await getMealTypes()).tiffin.titlePrefix).toBe("Tiffin Specials");
    await expect(setMealTypes({ tiffin: { slots: [], accent: "#000000", titlePrefix: "x" } } as never)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run; verify fails**

Run: `pnpm --filter web exec vitest run lib/services/__tests__/app-settings.service.test.ts`
Expected: FAIL — `getMealTypes is not a function`.

- [ ] **Step 3: Implement**

In `app-settings.service.ts` add the import and two functions (mirroring `getLeadAssignment`/`setLeadAssignment`):

```ts
import { DEFAULT_MEAL_TYPES, parseMealTypes, type MealTypesSettings } from "@/lib/menu/meal-types";
```

```ts
export async function getMealTypes(): Promise<MealTypesSettings> {
  return settingsCache.getOrSet("mealTypes", async () => {
    const [row] = await db.select({ mt: appSettings.mealTypes }).from(appSettings).limit(1);
    if (!row?.mt) return DEFAULT_MEAL_TYPES;
    try {
      return parseMealTypes(row.mt);
    } catch {
      return DEFAULT_MEAL_TYPES;
    }
  });
}

export async function setMealTypes(cfg: MealTypesSettings): Promise<void> {
  const parsed = parseMealTypes(cfg);
  const [row] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { mealTypes: parsed });
  else await appSettingsEntity.create({ ...DEFAULTS, mealTypes: parsed });
}
```

- [ ] **Step 4: Run; verify pass**

Run: `pnpm --filter web exec vitest run lib/services/__tests__/app-settings.service.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/app-settings.service.ts apps/web/lib/services/__tests__/app-settings.service.test.ts
git commit -m "feat(settings): meal-types get/set in app-settings service"
```

---

## Task 6: menu.service — plan-type scope, slot validation, reorder, getPublishedWeek

**Files:**
- Modify: `apps/web/lib/services/menu.service.ts`
- Test: `apps/web/lib/services/__tests__/menu.service.test.ts`

**Interfaces:**
- Produces (on `menuService`):
  - `upsertWeek({ planType: PlanType; weekStart: string; orderCutoff: string })`
  - `addItem({ menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; dishId: string; position: number })` — validates `slot` ∈ the week's plan-type slots
  - `removeItem(publicId)`
  - `reorderItems({ menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; orderedItemIds: string[] })`
  - `release(weekPublicId)` (evicts cache)
  - `weekWithItems(weekPublicId)`
  - `getPublishedWeek(planType: PlanType, weekStart?: string)` → `{ planType; theme; weekStart; slots; items: PosterItem[] } | null` (cached)
- Consumes: `getMealTypes` (slot validation + theme/slots in published), `PlanType`, `DayOfWeek`, `PosterItem`, commons repos/cache.

- [ ] **Step 1: Write failing tests (rewrite the file)**

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { auditLog, dishes, menuItems, menuWeeks } = await import("@/db/schema");
const { menuService } = await import("../menu.service");

async function reset() {
  await db.delete(auditLog);
  await db.delete(menuItems);
  await db.delete(menuWeeks);
  await db.delete(dishes);
}

describe("menuService (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("upsertWeek is scoped by plan_type", async () => {
    const a = await menuService.upsertWeek({ planType: "tiffin", weekStart: "2099-01-05", orderCutoff: "2099-01-04T18:00:00Z" });
    const b = await menuService.upsertWeek({ planType: "healthy", weekStart: "2099-01-05", orderCutoff: "2099-01-04T18:00:00Z" });
    expect(a.publicId).not.toBe(b.publicId); // same week, different type => distinct rows
    const again = await menuService.upsertWeek({ planType: "tiffin", weekStart: "2099-01-05", orderCutoff: "2099-01-03T18:00:00Z" });
    expect(again.publicId).toBe(a.publicId);
  });

  it("addItem validates slot against the plan type's slots", async () => {
    const [d] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: [] }).returning();
    const w = await menuService.upsertWeek({ planType: "tiffin", weekStart: "2099-01-12", orderCutoff: "2099-01-11T18:00:00Z" });
    await expect(menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "dinner", dishId: d.publicId, position: 0 })).rejects.toThrow();
    const ok = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "lunch", dishId: d.publicId, position: 0 });
    expect(ok).toBeTruthy();
  });

  it("reorderItems writes position; getPublishedWeek returns released items ordered", async () => {
    const [d1] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: [] }).returning();
    const [d2] = await db.insert(dishes).values({ name: "Dal", diet: "veg", slots: [] }).returning();
    const w = await menuService.upsertWeek({ planType: "tiffin", weekStart: "2099-01-19", orderCutoff: "2099-01-18T18:00:00Z" });
    const i1 = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "lunch", dishId: d1.publicId, position: 0 });
    const i2 = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "lunch", dishId: d2.publicId, position: 1 });
    await menuService.reorderItems({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "lunch", orderedItemIds: [i2!.publicId, i1!.publicId] });

    expect(await menuService.getPublishedWeek("tiffin")).toBeNull();
    await menuService.release(w.publicId);
    const pub = await menuService.getPublishedWeek("tiffin");
    expect(pub!.weekStart).toBe("2099-01-19");
    expect(pub!.slots.map((s) => s.key)).toEqual(["lunch"]);
    const mon = pub!.items.filter((x) => x.dayOfWeek === "mon").sort((a, b) => a.position - b.position);
    expect(mon.map((x) => x.dishName)).toEqual(["Dal", "Paneer"]);
  });
});
```

- [ ] **Step 2: Run; verify fails**

Run: `pnpm --filter web exec vitest run lib/services/__tests__/menu.service.test.ts`
Expected: FAIL (signature mismatch / planType required).

- [ ] **Step 3: Implement (rewrite menu.service.ts)**

```ts
import { ValidationError } from "@tiffin/commons";
import { LruTier, TieredCache } from "@tiffin/commons";
import { BaseRepository, UpdatableRepository } from "@tiffin/commons-drizzle";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, menuItems, menuWeeks } from "@/db/schema";
import { getMealTypes } from "./app-settings.service";
import type { PlanType } from "@/lib/menu/meal-types";
import type { DayOfWeek, PosterItem } from "@/lib/menu/poster";
import { SessionBaseService, SessionUpdatableService } from "./session-service";

const menuWeeksEntity = new SessionUpdatableService(new UpdatableRepository(db, menuWeeks, menuWeeks.publicId, menuWeeks.id));
const menuItemsEntity = new SessionBaseService(new BaseRepository(db, menuItems, menuItems.publicId, menuItems.id));

const publishedCache = new TieredCache({ name: "published-week", tiers: [new LruTier()], defaultTtlMs: 60_000 });

export const menuService = {
  async upsertWeek(input: { planType: PlanType; weekStart: string; orderCutoff: string }) {
    const cutoffMs = new Date(input.orderCutoff).getTime();
    const [existing] = await db.select().from(menuWeeks)
      .where(and(eq(menuWeeks.planType, input.planType), eq(menuWeeks.weekStart, input.weekStart))).limit(1);
    if (existing) return menuWeeksEntity.update(existing.publicId, { orderCutoff: cutoffMs });
    return menuWeeksEntity.create({ planType: input.planType, weekStart: input.weekStart, orderCutoff: cutoffMs });
  },

  async addItem(input: { menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; dishId: string; position: number }) {
    const [week] = await db.select({ id: menuWeeks.id, planType: menuWeeks.planType }).from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
    if (!week) throw new ValidationError("Week not found");
    const mealTypes = await getMealTypes();
    const allowed = new Set(mealTypes[week.planType as PlanType].slots.map((s) => s.key));
    if (!allowed.has(input.slot)) throw new ValidationError(`Slot "${input.slot}" is not configured for this plan type`);
    const [dish] = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.publicId, input.dishId)).limit(1);
    if (!dish) throw new ValidationError("Dish not found");
    const [dupe] = await db.select({ id: menuItems.id }).from(menuItems)
      .where(and(eq(menuItems.menuWeekId, week.id), eq(menuItems.dayOfWeek, input.dayOfWeek), eq(menuItems.slot, input.slot), eq(menuItems.dishId, dish.id))).limit(1);
    if (dupe) return null;
    return menuItemsEntity.create({
      menuWeekId: week.id, dayOfWeek: input.dayOfWeek, slot: input.slot, dishId: dish.id, isDefault: false, position: input.position,
    });
  },

  async removeItem(publicId: string) {
    await menuItemsEntity.delete(publicId);
  },

  async reorderItems(input: { menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; orderedItemIds: string[] }) {
    // Raw bulk position update by public id; NOT audited (matches existing bulk pattern). Documented.
    await Promise.all(input.orderedItemIds.map((pid, idx) => db.update(menuItems).set({ position: idx }).where(eq(menuItems.publicId, pid))));
  },

  async release(weekPublicId: string) {
    await menuWeeksEntity.update(weekPublicId, { status: "released", releasedAt: Date.now() });
    await publishedCache.evictAll();
  },

  async weekWithItems(weekPublicId: string) {
    const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, weekPublicId)).limit(1);
    if (!week) return { week: undefined, items: [] };
    const items = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, week.id)).orderBy(asc(menuItems.position));
    return { week, items };
  },

  async getPublishedWeek(planType: PlanType, weekStart?: string) {
    return publishedCache.getOrSet(`${planType}:${weekStart ?? "current"}`, async () => {
      const base = and(eq(menuWeeks.planType, planType), eq(menuWeeks.status, "released"));
      const [week] = await db.select().from(menuWeeks)
        .where(weekStart ? and(base, eq(menuWeeks.weekStart, weekStart)) : base)
        .orderBy(asc(menuWeeks.weekStart)).limit(1);
      if (!week) return null;
      const rows = await db
        .select({ dayOfWeek: menuItems.dayOfWeek, slot: menuItems.slot, position: menuItems.position, dishName: dishes.name, diet: dishes.diet })
        .from(menuItems).innerJoin(dishes, eq(menuItems.dishId, dishes.id))
        .where(eq(menuItems.menuWeekId, week.id)).orderBy(asc(menuItems.position));
      const mealTypes = await getMealTypes();
      const cfg = mealTypes[planType];
      const items: PosterItem[] = rows.map((r) => ({ dayOfWeek: r.dayOfWeek as DayOfWeek, slot: r.slot, dishName: r.dishName, diet: r.diet, position: r.position }));
      return { planType, theme: { accent: cfg.accent, titlePrefix: cfg.titlePrefix }, weekStart: week.weekStart, slots: cfg.slots, items };
    });
  },
};
```

> `getPublishedWeek` returns the earliest released week as "current" for the MVP (today-aware selection is a later refinement, noted in spec).

- [ ] **Step 4: Run; verify pass**

Run: `pnpm --filter web exec vitest run lib/services/__tests__/menu.service.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/menu.service.ts apps/web/lib/services/__tests__/menu.service.test.ts
git commit -m "feat(menu): plan-type scoped weeks, slot validation, reorder, cached getPublishedWeek"
```

---

## Task 7: Catalog derives offeredSlots from meal types

**Files:**
- Modify: `apps/web/lib/catalog/load.ts`
- Test: add a case to an existing catalog test or create `apps/web/lib/catalog/__tests__/offered-slots.test.ts`

**Interfaces:**
- Consumes: `getMealTypes`.
- Behavior: each plan's `offeredSlots` in the snapshot = `getMealTypes()[plan.planType].slots.map(s => s.key)`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/catalog/__tests__/offered-slots.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { loadCatalogSnapshot } = await import("../load");
const { setMealTypes, getMealTypes } = await import("@/lib/services/app-settings.service");

describe("catalog offeredSlots derives from meal types", () => {
  it("healthy plans expose the configured healthy slots", async () => {
    const current = await getMealTypes();
    await setMealTypes({ ...current, healthy: { ...current.healthy, slots: [{ key: "lunch", label: "Lunch" }, { key: "dinner", label: "Dinner" }] } });
    const snap = await loadCatalogSnapshot();
    const healthy = snap.plans.find((p) => p.planType === "healthy");
    if (healthy) expect(healthy.offeredSlots).toEqual(["lunch", "dinner"]);
  });
});
```

> If `loadCatalogSnapshot` is cached, this test must also evict that cache first — check `load.ts` for a cache and call its eviction in the test; otherwise the assertion may read a stale snapshot.

- [ ] **Step 2: Run; verify fails (or is stale)**

Run: `pnpm --filter web exec vitest run lib/catalog/__tests__/offered-slots.test.ts`
Expected: FAIL — offeredSlots still from the column.

- [ ] **Step 3: Implement**

In `apps/web/lib/catalog/load.ts`, import `getMealTypes`, await it alongside the existing plan query, and override `offeredSlots` in the `plans.map(...)`:

```ts
import { getMealTypes } from "@/lib/services/app-settings.service";
```

```ts
const mealTypes = await getMealTypes();
// ...in the plans mapping:
offeredSlots: mealTypes[p.planType as "tiffin" | "healthy"].slots.map((s) => s.key),
```

(Keep all other mapped fields unchanged.)

- [ ] **Step 4: Run; verify pass**

Run: `pnpm --filter web exec vitest run lib/catalog/__tests__/offered-slots.test.ts`
Expected: passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/catalog/load.ts apps/web/lib/catalog/__tests__/offered-slots.test.ts
git commit -m "feat(catalog): derive plan offeredSlots from meal-types settings"
```

---

## Task 8: Seed meal-types defaults + menu seed planType/position

**Files:**
- Modify: `apps/web/db/seed.ts`
- Modify: `apps/web/db/seed-menu.ts`

- [ ] **Step 1: Seed mealTypes defaults**

In `apps/web/db/seed.ts`, after the app-settings singleton insert, ensure `mealTypes` is set when missing:

```ts
import { DEFAULT_MEAL_TYPES } from "@/lib/menu/meal-types";
// ...
const [row] = await db.select({ publicId: appSettings.publicId, mealTypes: appSettings.mealTypes }).from(appSettings).limit(1);
if (!row) await db.insert(appSettings).values({ timezone: "America/Toronto", cutoffHour: 18, mealTypes: DEFAULT_MEAL_TYPES });
else if (!row.mealTypes) await db.update(appSettings).set({ mealTypes: DEFAULT_MEAL_TYPES }).where(eq(appSettings.publicId, row.publicId));
```

(Adjust the existing `if (!existing)` block to include `mealTypes`; import `eq` if not present.)

- [ ] **Step 2: seed-menu planType + position + slot**

In `apps/web/db/seed-menu.ts`, set `planType: "tiffin"` on each `menuWeeks` insert, and on each `menuItems` insert use a real slot key (`"lunch"`) + `position` (index within day/slot). Remove any reliance on `mealSlots.enabled`.

- [ ] **Step 3: Run seeds**

Run: `pnpm --filter web db:seed && pnpm --filter web db:seed:menu`
Expected: both exit 0. `psql "$DATABASE_URL" -c "select meal_types is not null from app_settings;"` → `t`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/db/seed.ts apps/web/db/seed-menu.ts
git commit -m "chore(menu): seed meal-types defaults; seed menu weeks with plan_type + position"
```

---

## Task 9: Marketing poster component

**Files:**
- Create: `apps/web/components/marketing/weekly-menu-poster.tsx`

**Interfaces:**
- Consumes: `buildPosterColumns`, `PosterItem` from `@/lib/menu/poster`; `MealSlot` from `@/lib/menu/meal-types`.
- Produces: `WeeklyMenuPoster({ titlePrefix, weekStart, slots, items, accent }: { titlePrefix: string; weekStart: string; slots: MealSlot[]; items: PosterItem[]; accent: string })`.

- [ ] **Step 1: Implement**

```tsx
// apps/web/components/marketing/weekly-menu-poster.tsx
import { buildPosterColumns, type PosterItem } from "@/lib/menu/poster";
import type { MealSlot } from "@/lib/menu/meal-types";

function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function WeeklyMenuPoster({
  titlePrefix, weekStart, slots, items, accent,
}: { titlePrefix: string; weekStart: string; slots: MealSlot[]; items: PosterItem[]; accent: string }) {
  const columns = buildPosterColumns(slots, items);
  return (
    <div className="rounded-2xl border bg-card p-6 sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight" style={{ color: accent }}>
        {titlePrefix} — {weekRangeLabel(weekStart)}
      </h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {columns.map((col) => (
          <div key={col.label} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: accent }}>{col.label}</h3>
            {col.groups.map((g, gi) => (
              <div key={g.slotLabel ?? gi} className="space-y-1">
                {g.slotLabel ? <p className="text-xs font-medium text-muted-foreground">{g.slotLabel}</p> : null}
                <ul className="space-y-1">
                  {g.dishes.length === 0 ? (
                    <li className="text-sm text-muted-foreground">—</li>
                  ) : g.dishes.map((d, i) => (
                    <li key={`${d.name}-${i}`} className="flex items-center gap-2 text-sm">
                      <span aria-hidden className={`size-2 rounded-full ${d.diet === "veg" ? "bg-green-600" : "bg-red-600"}`} />
                      <span>{d.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter web exec tsc --noEmit
git add apps/web/components/marketing/weekly-menu-poster.tsx
git commit -m "feat(menu): weekly menu poster component (flat + slot-grouped)"
```

---

## Task 10: Marketing surfaces + react-pdf download

**Files:**
- Create: `apps/web/lib/menu/pdf.tsx`
- Test: `apps/web/lib/menu/__tests__/pdf.test.ts`
- Create: `apps/web/app/(marketing)/menu/weekly/page.tsx`
- Create: `apps/web/app/(marketing)/menu/weekly/pdf/route.ts`
- Modify: `apps/web/app/(marketing)/page.tsx`
- Modify: `apps/web/components/marketing/site-header.tsx`
- Modify: `apps/web/package.json` (add `@react-pdf/renderer`)

**Interfaces:**
- Produces: `renderWeeklyMenuPdf(planType: PlanType, weekStart?: string): Promise<Uint8Array>`.
- Consumes: `menuService.getPublishedWeek`, `buildPosterColumns`.

- [ ] **Step 1: Add dependency**

Run: `pnpm --filter web add @react-pdf/renderer`

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/lib/menu/__tests__/pdf.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { renderWeeklyMenuPdf } = await import("../pdf");
const { menuService } = await import("@/lib/services/menu.service");

describe("renderWeeklyMenuPdf", () => {
  it("returns a %PDF- byte stream for a published week", async () => {
    vi.spyOn(menuService, "getPublishedWeek").mockResolvedValue({
      planType: "tiffin", theme: { accent: "#F0820A", titlePrefix: "Tiffin Menu" },
      weekStart: "2099-01-05", slots: [{ key: "lunch", label: "Lunch" }],
      items: [{ dayOfWeek: "mon", slot: "lunch", dishName: "Paneer", diet: "veg", position: 0 }],
    } as never);
    const bytes = await renderWeeklyMenuPdf("tiffin");
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("throws when nothing is published", async () => {
    vi.spyOn(menuService, "getPublishedWeek").mockResolvedValue(null);
    await expect(renderWeeklyMenuPdf("tiffin")).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run; verify fails**

Run: `pnpm --filter web exec vitest run lib/menu/__tests__/pdf.test.ts`
Expected: FAIL — cannot find `../pdf`.

- [ ] **Step 4: Implement the renderer**

```tsx
// apps/web/lib/menu/pdf.tsx
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { NotFoundError } from "@tiffin/commons";
import { buildPosterColumns } from "@/lib/menu/poster";
import type { PlanType } from "@/lib/menu/meal-types";
import { menuService } from "@/lib/services/menu.service";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11 },
  title: { fontSize: 20, marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  col: { width: "33%", marginBottom: 14, paddingRight: 8 },
  colTitle: { fontSize: 12, marginBottom: 4, textTransform: "uppercase" },
  slot: { fontSize: 9, marginTop: 4, color: "#666" },
  dish: { marginBottom: 2 },
});

export async function renderWeeklyMenuPdf(planType: PlanType, weekStart?: string): Promise<Uint8Array> {
  const pub = await menuService.getPublishedWeek(planType, weekStart);
  if (!pub) throw new NotFoundError("No published menu for this week");
  const columns = buildPosterColumns(pub.slots, pub.items);
  const buf = await renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={{ ...styles.title, color: pub.theme.accent }}>{pub.theme.titlePrefix} — {pub.weekStart}</Text>
        <View style={styles.grid}>
          {columns.map((col) => (
            <View key={col.label} style={styles.col}>
              <Text style={{ ...styles.colTitle, color: pub.theme.accent }}>{col.label}</Text>
              {col.groups.map((g, gi) => (
                <View key={g.slotLabel ?? gi}>
                  {g.slotLabel ? <Text style={styles.slot}>{g.slotLabel}</Text> : null}
                  {g.dishes.length === 0 ? <Text style={styles.dish}>—</Text>
                    : g.dishes.map((d, i) => <Text key={`${d.name}-${i}`} style={styles.dish}>• {d.name}</Text>)}
                </View>
              ))}
            </View>
          ))}
        </View>
      </Page>
    </Document>,
  );
  return new Uint8Array(buf);
}
```

- [ ] **Step 5: Run; verify pass**

Run: `pnpm --filter web exec vitest run lib/menu/__tests__/pdf.test.ts`
Expected: 2 passed.

- [ ] **Step 6: Download route**

```ts
// apps/web/app/(marketing)/menu/weekly/pdf/route.ts
import { renderWeeklyMenuPdf } from "@/lib/menu/pdf";

export async function GET() {
  try {
    const bytes = await renderWeeklyMenuPdf("tiffin");
    return new Response(bytes as BodyInit, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="tiffin-weekly-menu.pdf"' },
    });
  } catch {
    return new Response("No menu published", { status: 404 });
  }
}
```

- [ ] **Step 7: Dedicated route page**

```tsx
// apps/web/app/(marketing)/menu/weekly/page.tsx
import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";
import { WeeklyMenuPoster } from "@/components/marketing/weekly-menu-poster";
import { menuService } from "@/lib/services/menu.service";

export const metadata: Metadata = { title: "This week's menu — Tiffin Grab", description: "Our weekly tiffin menu across the GTA." };
export const revalidate = 600;

export default async function WeeklyMenuPage() {
  const pub = await menuService.getPublishedWeek("tiffin");
  return (
    <Section className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">This week&apos;s menu</h1>
        <p className="text-muted-foreground mt-2">Fresh, home-style tiffin — updated every week.</p>
      </div>
      {pub ? (
        <>
          <WeeklyMenuPoster titlePrefix={pub.theme.titlePrefix} weekStart={pub.weekStart} slots={pub.slots} items={pub.items} accent={pub.theme.accent} />
          <a href="/menu/weekly/pdf" className="inline-flex w-fit items-center rounded-md border px-4 py-2 text-sm font-medium hover-lift">Download PDF</a>
        </>
      ) : (
        <p className="text-muted-foreground">Menu coming soon — check back shortly.</p>
      )}
    </Section>
  );
}
```

- [ ] **Step 8: Homepage section + nav link**

In `apps/web/app/(marketing)/page.tsx`: add `const pub = await menuService.getPublishedWeek("tiffin");` at the top (make the component `async` if needed), import `WeeklyMenuPoster`, `Section`, `menuService`, and insert between the VALUES grid and the CTA:

```tsx
{pub && (
  <Section className="space-y-6">
    <h2 className="text-2xl font-semibold tracking-tight">This week&apos;s menu</h2>
    <WeeklyMenuPoster titlePrefix={pub.theme.titlePrefix} weekStart={pub.weekStart} slots={pub.slots} items={pub.items} accent={pub.theme.accent} />
  </Section>
)}
```

In `apps/web/components/marketing/site-header.tsx`, add after the `/menu` entry: `{ href: "/menu/weekly", label: "Weekly Menu" },`.

- [ ] **Step 9: Typecheck + commit**

```bash
pnpm --filter web exec tsc --noEmit
git add apps/web/lib/menu/pdf.tsx apps/web/lib/menu/__tests__/pdf.test.ts "apps/web/app/(marketing)" apps/web/components/marketing/site-header.tsx apps/web/package.json
git commit -m "feat(menu): marketing weekly poster (home + route), react-pdf download"
```

---

## Task 11: Settings — meal-types panel

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/settings/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/settings/meal-types-form.tsx`
- Modify/Create: `apps/web/app/(dashboard)/dashboard/settings/actions.ts` (add `saveMealTypes`)

**Interfaces:**
- Consumes: `getMealTypes`, `setMealTypes`, `requireAdmin`, `MealTypesSettings`.
- Produces: action `saveMealTypes(cfg: MealTypesSettings): Promise<void>`.

- [ ] **Step 1: Action**

Add to the settings `actions.ts` (create the file with `"use server"` if absent):

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setMealTypes } from "@/lib/services/app-settings.service";
import type { MealTypesSettings } from "@/lib/menu/meal-types";

export async function saveMealTypes(cfg: MealTypesSettings) {
  await requireAdmin();
  await setMealTypes(cfg);
  revalidatePath("/dashboard/settings");
  revalidatePath("/menu/weekly");
  revalidatePath("/");
}
```

- [ ] **Step 2: Client form**

```tsx
// apps/web/app/(dashboard)/dashboard/settings/meal-types-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MealTypesSettings, PlanType } from "@/lib/menu/meal-types";
import { PLAN_TYPES } from "@/lib/menu/meal-types";
import { saveMealTypes } from "./actions";

export function MealTypesForm({ initial }: { initial: MealTypesSettings }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<MealTypesSettings>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = (t: PlanType, patch: Partial<MealTypesSettings[PlanType]>) =>
    setCfg((c) => ({ ...c, [t]: { ...c[t], ...patch } }));
  const setSlot = (t: PlanType, i: number, patch: Partial<{ key: string; label: string }>) =>
    setCfg((c) => ({ ...c, [t]: { ...c[t], slots: c[t].slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) } }));
  const addSlot = (t: PlanType) => setCfg((c) => ({ ...c, [t]: { ...c[t], slots: [...c[t].slots, { key: "", label: "" }] } }));
  const removeSlot = (t: PlanType, i: number) => setCfg((c) => ({ ...c, [t]: { ...c[t], slots: c[t].slots.filter((_, j) => j !== i) } }));

  const save = () => start(async () => {
    setError(null);
    try { await saveMealTypes(cfg); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
  });

  return (
    <div className="space-y-8">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {PLAN_TYPES.map((t) => (
        <div key={t} className="rounded-lg border p-4 space-y-3">
          <h3 className="font-medium capitalize">{t}</h3>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">Title prefix
              <Input value={cfg[t].titlePrefix} onChange={(e) => update(t, { titlePrefix: e.target.value })} />
            </label>
            <label className="text-sm">Accent
              <Input type="color" value={cfg[t].accent} onChange={(e) => update(t, { accent: e.target.value })} />
            </label>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Meal slots</p>
            {cfg[t].slots.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="key (e.g. lunch)" value={s.key} onChange={(e) => setSlot(t, i, { key: e.target.value })} className="w-40" />
                <Input placeholder="Label (e.g. Lunch)" value={s.label} onChange={(e) => setSlot(t, i, { label: e.target.value })} className="w-48" />
                <button className="text-xs text-destructive" onClick={() => removeSlot(t, i)}>remove</button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => addSlot(t)}>+ slot</Button>
          </div>
        </div>
      ))}
      <Button onClick={save} disabled={pending}>Save meal types</Button>
    </div>
  );
}
```

> Slot `key` is a constrained free-text identifier (validated by `mealTypesSchema` server-side: lowercase alphanumeric/underscore). This is an identifier field, not an enum/date/ref, so a text input is the correct typed control here.

- [ ] **Step 3: Mount in the settings page**

In `apps/web/app/(dashboard)/dashboard/settings/page.tsx`, load and render under a SectionCard:

```tsx
import { getMealTypes } from "@/lib/services/app-settings.service";
import { MealTypesForm } from "./meal-types-form";
// ...inside the page (await requireAdmin already present):
const mealTypes = await getMealTypes();
// ...in JSX:
<SectionCard title="Meal types & slots"><MealTypesForm initial={mealTypes} /></SectionCard>
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter web exec tsc --noEmit
git add "apps/web/app/(dashboard)/dashboard/settings"
git commit -m "feat(settings): meal-types & slots panel"
```

---

## Task 12: Admin builder rebuild (plan-type + slot aware)

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/menus/actions.ts`
- Modify: `apps/web/app/(dashboard)/dashboard/menus/page.tsx`
- Rewrite: `apps/web/app/(dashboard)/dashboard/menus/menu-builder.tsx`

**Interfaces:**
- Consumes: `menuService`, `getMealTypes`, `requireAdmin`, `WeeklyMenuPoster`, `DAY_COLUMNS`, poster/meal-type types, ui `Select`/`Button`.
- Produces: actions `upsertWeek`, `addItem`, `removeItem`, `releaseWeek`.

- [ ] **Step 1: Actions**

```ts
// apps/web/app/(dashboard)/dashboard/menus/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import type { PlanType } from "@/lib/menu/meal-types";
import type { DayOfWeek } from "@/lib/menu/poster";

function revalidate() {
  revalidatePath("/dashboard/menus");
  revalidatePath("/menu/weekly");
  revalidatePath("/");
}

export async function upsertWeek(input: { planType: PlanType; weekStart: string; orderCutoff: string }) {
  await requireAdmin();
  const w = await menuService.upsertWeek(input);
  revalidate();
  return { publicId: w.publicId };
}

export async function addItem(input: { menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; dishId: string; position: number }) {
  await requireAdmin();
  const item = await menuService.addItem(input);
  revalidate();
  return item ? { publicId: item.publicId } : null;
}

export async function removeItem(id: string) {
  await requireAdmin();
  await menuService.removeItem(id);
  revalidate();
}

export async function releaseWeek(menuWeekId: string) {
  await requireAdmin();
  await menuService.release(menuWeekId);
  revalidate();
}
```

- [ ] **Step 2: Page loader**

```tsx
// apps/web/app/(dashboard)/dashboard/menus/page.tsx
import { asc, eq } from "drizzle-orm";
import { CalendarIcon } from "lucide-react";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import { getMealTypes } from "@/lib/services/app-settings.service";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuBuilder } from "./menu-builder";
import type { PlanType } from "@/lib/menu/meal-types";

export default async function MenusPage({ searchParams }: { searchParams: Promise<{ type?: string; week?: string }> }) {
  await requireAdmin();
  const { type, week: weekId } = await searchParams;
  const planType: PlanType = type === "healthy" ? "healthy" : "tiffin";

  const [mealTypes, activeDishes] = await Promise.all([
    getMealTypes(),
    db.select({ id: dishes.publicId, name: dishes.name, diet: dishes.diet }).from(dishes).where(eq(dishes.active, true)).orderBy(asc(dishes.name)),
  ]);

  let week: { id: string; weekStart: string; status: string; orderCutoff: string } | null = null;
  let items: { id: string; dayOfWeek: string; slot: string; dishId: string; position: number }[] = [];
  if (weekId) {
    const result = await menuService.weekWithItems(weekId);
    if (result.week) {
      week = { id: result.week.publicId, weekStart: result.week.weekStart, status: result.week.status, orderCutoff: new Date(result.week.orderCutoff).toISOString() };
      const dishRows = await db.select({ bigintId: dishes.id, publicId: dishes.publicId }).from(dishes);
      const byId = new Map(dishRows.map((d) => [d.bigintId, d.publicId]));
      items = result.items.flatMap((i) => {
        const dishId = byId.get(i.dishId);
        return dishId ? [{ id: i.publicId, dayOfWeek: i.dayOfWeek, slot: i.slot, dishId, position: i.position }] : [];
      });
    }
  }

  return (
    <PageShell>
      <PageHeader icon={CalendarIcon} title="Weekly Menus" />
      <SectionCard title="Menu builder">
        <MenuBuilder planType={planType} mealType={mealTypes[planType]} dishes={activeDishes} week={week} items={items} />
      </SectionCard>
    </PageShell>
  );
}
```

- [ ] **Step 3: Builder component**

```tsx
// apps/web/app/(dashboard)/dashboard/menus/menu-builder.tsx
"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WeeklyMenuPoster } from "@/components/marketing/weekly-menu-poster";
import { DAY_COLUMNS, type DayOfWeek, type PosterItem } from "@/lib/menu/poster";
import type { MealTypeConfig, PlanType } from "@/lib/menu/meal-types";
import { addItem, releaseWeek, removeItem, upsertWeek } from "./actions";

type Dish = { id: string; name: string; diet: "veg" | "nonveg" };
type Week = { id: string; weekStart: string; status: string; orderCutoff: string };
type Item = { id: string; dayOfWeek: string; slot: string; dishId: string; position: number };

export function MenuBuilder({
  planType, mealType, dishes, week, items,
}: { planType: PlanType; mealType: MealTypeConfig; dishes: Dish[]; week: Week | null; items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(week?.weekStart ?? "");
  const [orderCutoff, setOrderCutoff] = useState(week?.orderCutoff ? new Date(week.orderCutoff).toISOString().slice(0, 16) : "");

  const run = (fn: () => Promise<void>) => start(async () => {
    setError(null);
    try { await fn(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
  });

  const dishById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const posterItems: PosterItem[] = items.flatMap((i) => {
    const d = dishById.get(i.dishId);
    return d ? [{ dayOfWeek: i.dayOfWeek as DayOfWeek, slot: i.slot, dishName: d.name, diet: d.diet, position: i.position }] : [];
  });

  const handleUpsert = () => {
    if (!weekStart || !orderCutoff) return;
    run(async () => {
      const w = await upsertWeek({ planType, weekStart, orderCutoff: new Date(orderCutoff).toISOString() });
      router.push(`/dashboard/menus?type=${planType}&week=${w.publicId}`);
    });
  };

  const cellItems = (days: DayOfWeek[], slot: string) =>
    items.filter((i) => days.includes(i.dayOfWeek as DayOfWeek) && i.slot === slot)
      .sort((a, b) => days.indexOf(a.dayOfWeek as DayOfWeek) - days.indexOf(b.dayOfWeek as DayOfWeek) || a.position - b.position);

  return (
    <div className="space-y-6">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Plan type</label>
          <Select value={planType} onValueChange={(t) => router.push(`/dashboard/menus?type=${t}`)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tiffin">Tiffin</SelectItem>
              <SelectItem value="healthy">Healthy</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Week start (Monday)</label>
          <input type="date" className="rounded-md border px-3 py-2 text-sm" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Order cutoff</label>
          <input type="datetime-local" className="rounded-md border px-3 py-2 text-sm" value={orderCutoff} onChange={(e) => setOrderCutoff(e.target.value)} />
        </div>
        <Button onClick={handleUpsert} disabled={pending || !weekStart || !orderCutoff}>{week ? "Update week" : "Create week"}</Button>
        {week && week.status === "draft" && <Button variant="destructive" disabled={pending} onClick={() => run(() => releaseWeek(week.id))}>Release</Button>}
        {week && week.status === "released" && <span className="text-sm text-muted-foreground">Released</span>}
      </div>

      {week && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {DAY_COLUMNS.map((col) => {
              const storeDay = col.days[0]; // weekend dishes stored under sat
              return (
                <div key={col.label} className="rounded-lg border p-3">
                  <h4 className="mb-2 text-sm font-semibold">{col.label}</h4>
                  {mealType.slots.map((slot) => {
                    const ci = cellItems(col.days, slot.key);
                    const addable = dishes.filter((d) => !ci.some((i) => i.dishId === d.id));
                    return (
                      <div key={slot.key} className="mb-2">
                        {mealType.slots.length > 1 && <p className="text-xs text-muted-foreground">{slot.label}</p>}
                        <div className="space-y-1">
                          {ci.map((i) => {
                            const d = dishById.get(i.dishId);
                            return (
                              <div key={i.id} className="flex items-center gap-2 text-sm">
                                <span className={`size-2 rounded-full ${d?.diet === "veg" ? "bg-green-600" : "bg-red-600"}`} />
                                <span className="flex-1">{d?.name ?? i.dishId}</span>
                                {week.status === "draft" && <button className="text-xs text-destructive" disabled={pending} onClick={() => run(() => removeItem(i.id))}>✕</button>}
                              </div>
                            );
                          })}
                          {week.status === "draft" && addable.length > 0 && (
                            <Select onValueChange={(dishId) => run(() => addItem({ menuWeekId: week.id, dayOfWeek: storeDay, slot: slot.key, dishId, position: ci.length }).then(() => {}))}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="+ add dish" /></SelectTrigger>
                              <SelectContent>{addable.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="lg:sticky lg:top-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Live preview</p>
            <WeeklyMenuPoster titlePrefix={mealType.titlePrefix} weekStart={weekStart || week.weekStart} slots={mealType.slots} items={posterItems} accent={mealType.accent} />
          </div>
        </div>
      )}
    </div>
  );
}
```

> Drag-reorder UI deferred; `position` is set by add order (spec out-of-scope note).

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter web exec tsc --noEmit
git add "apps/web/app/(dashboard)/dashboard/menus"
git commit -m "feat(menu): poster-style admin builder (plan-type + slot aware, live preview)"
```

---

## Task 13: Full suite + manual verification

- [ ] **Step 1: Full test suite**

Run: `pnpm --filter web test`
Expected: all green.

- [ ] **Step 2: Manual app check**

Run: `pnpm --filter web dev`. Verify:
- `/dashboard/settings` — Meal types panel shows tiffin/healthy; edit slots/accent/title; Save.
- `/dashboard/menus` — switch plan type; tiffin shows flat add per day, healthy shows per-slot add; create week, add dishes, live preview matches; Release.
- `/menu/weekly` — released poster shows; "Download PDF" downloads a valid `.pdf`.
- `/` — homepage shows the weekly poster.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix(menu): address issues found in verification"
```

---

## Self-Review

- **Spec coverage:** unified plan_type model (T1,T6) ✓; meal-types config in app_settings + Settings panel (T1,T3,T5,T11) ✓; slots/theme source of truth + catalog derive (T7) ✓; poster flat-vs-grouped (T4,T9) ✓; replace old builder (T12) ✓; homepage + route (T10) ✓; react-pdf download, no abstract/puppeteer (T10) ✓; email out of scope ✓; migration (T2) ✓; seeds (T8) ✓; live-DB tests (T4,T5,T6,T7,T10) ✓; phase-2 readiness — real `slot`, `meal_selections` untouched ✓.
- **Deferred (noted):** drag-reorder UI; today-aware `getPublishedWeek` (returns earliest released); `mealSlots` table left in place (deprecated).
- **Placeholders:** none — every step has real code/commands.
- **Type consistency:** `PosterItem`/`RenderedColumn`/`getPublishedWeek` shape/`MealTypeConfig`/action signatures consistent across T4/T6/T9/T10/T12.
