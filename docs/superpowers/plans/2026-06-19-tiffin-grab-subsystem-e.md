# Subsystem E Implementation Plan — Weekly-Menu Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the weekly-menu engine — dishes catalog, admin meal-slot settings, weekly menu release, and per-day/slot/person customer meal selection with cutoff locking and defaults — plus the bundled subsystem-C amendment (`dailyQty`→`persons`, `mealSlots`, persons×slots×days pricing).

**Architecture:** New entities live in `apps/web/db/schema/menu.ts`. Meal slots are a global admin config (`meal_slots`); the wizard/order/menu builder all read enabled slots from it. The pricing engine gains a `mealSlots.length` multiplier and `dailyQty` becomes `persons`. A shared `lib/menu` holds delivery-day computation and the selection service (grid, locked save, default-fill). Admin builds/release menus; customers pick dishes for their active order.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Drizzle/Postgres, Vitest, Tailwind + shadcn.

## Global Constraints

- **Next.js 16:** `params` is a Promise; route guard is `proxy.ts`; read `node_modules/next/dist/docs/` before framework code.
- **Pricing is server-side only**; `createOrder` always reprices. Discount order is courier → student → loyalty (unchanged). Audit fields stamped from session; service write paths strip managed fields.
- **Persons & slots:** `orders.dailyQty` → `persons` (1–5, default 1); add `orders.mealSlots` `text[]` not null default `'{lunch}'`. `weeklyFee = basePrice × persons × mealSlots.length × billableDays` + add-ons − discounts. `billableDays` = frequency `daysPerWeek` + (Saturday?1:0) + (Sunday?1:0).
- **Meal slots are global admin config**, seeded **lunch enabled, breakfast/dinner disabled**. Enabling a slot is **non-retroactive** (existing orders keep stored `mealSlots`).
- **Diet filter:** plan `veg`→veg dishes; `halal_nonveg`→nonveg; `mixed`→both.
- **Migrations:** `drizzle-kit generate` needs a TTY for **renames** — hand-author the `daily_qty`→`persons` rename SQL and token-swap the snapshot (as done for the subsystem-D `subscriptions`→`orders` rename: write `db/migrations/NNNN_*.sql` with `ALTER TABLE ... RENAME COLUMN`, add the journal entry, and copy the previous `meta/NNNN_snapshot.json` with the token swapped + new `id`/`prevId`). New-table/new-column migrations generate non-interactively. Run from `apps/web`.
- **DB:** local Postgres at `DATABASE_URL` (default `postgres://lawbringr@localhost:5432/tiffin`); drizzle-kit/tsx do NOT auto-load `.env.local` — pass `DATABASE_URL=...` on the command. Tests share this DB and wipe rows; reseed (`pnpm db:seed:catalog`, `db:seed:admin`, `db:seed:menu`) after a manual run.
- **Vitest + session services:** any test importing a service that transitively imports `@/lib/auth` must `vi.mock("@/lib/auth", () => ({ auth: async () => null }))` and import the subject via `await import(...)` after the mock.
- **TypeScript everywhere; no unnecessary comments.** `rg`/`fd` over grep/find. Commits plain, NO `Co-Authored-By` trailer.
- **Verify (root):** `pnpm test && pnpm typecheck && pnpm build`.

---

## File structure

```
apps/web/
├─ db/schema/menu.ts                  # meal_slots, dishes, menu_weeks, menu_items, meal_selections
├─ db/seed-menu.ts                    # slots + sample dishes + a released week
├─ lib/
│  ├─ pricing/{types,engine,build-catalog}.ts   # persons + mealSlots multiplier (amend)
│  ├─ menu/
│  │  ├─ delivery-days.ts             # orderDeliveryDays, visibleSlots
│  │  └─ selections.service.ts        # grid / setSelection / effectiveSelections
│  └─ services/
│     ├─ meal-slots.service.ts        # enabled-slot config
│     ├─ dishes.service.ts            # soft-delete CRUD
│     └─ menu.service.ts              # weeks + items (admin)
├─ app/
│  ├─ api/dishes/**, api/meal-slots/**            # admin REST
│  └─ (dashboard)/dashboard/
│     ├─ settings/meal-slots/{page,actions,toggle}.tsx
│     ├─ dishes/**                    # admin dishes editor
│     ├─ menus/**                     # admin weekly builder
│     └─ meals/**                     # customer selection grid
└─ (amend) lib/services/orders.service.ts, app/(public)/checkout/*, components/wizard/*,
   app/(dashboard)/dashboard/inquiries/[id]/order/* — dailyQty→persons + mealSlots
```

---

## Phase 1 — Meal slots + dishes (foundations)

### Task 1: `meal_slots` config + admin settings

**Files:**
- Create: `apps/web/db/schema/menu.ts` (meal_slots only this task), `apps/web/lib/services/meal-slots.service.ts`
- Modify: `apps/web/db/schema/index.ts`
- Create: `apps/web/app/api/meal-slots/{route,[id]/route}.ts`
- Create: `apps/web/app/(dashboard)/dashboard/settings/meal-slots/{page.tsx,actions.ts,slot-toggle.tsx}`
- Create: `apps/web/db/seed-menu.ts` (slots seed only this task), add `db:seed:menu` script
- Test: `apps/web/lib/services/__tests__/meal-slots.service.test.ts`

**Interfaces:**
- Produces: `mealSlots` table `{ id, key, label, enabled, sortOrder, ...updatable }`; `mealSlotsService` (UpdatableService) + `enabledSlots(): Promise<{key,label,sortOrder}[]>`. Consumed by Tasks 3 (wizard), 5 (menu builder), 7 (selection).

- [ ] **Step 1: Schema** — create `apps/web/db/schema/menu.ts`

```ts
import { updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";

export const mealSlots = pgTable("meal_slots", {
  ...updatableColumns,
  key: text("key").notNull().unique(), // breakfast | lunch | dinner
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});
```

Add `export * from "./menu";` to `apps/web/db/schema/index.ts`.

- [ ] **Step 2: Migrate**

Run: `cd apps/web && pnpm db:generate --name meal_slots && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate`
Expected: creates `meal_slots`.

- [ ] **Step 3: Write the failing test** — `apps/web/lib/services/__tests__/meal-slots.service.test.ts`

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { mealSlots } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { mealSlotsService } = await import("../meal-slots.service");

async function reset() { await db.delete(mealSlots); }

describe("mealSlotsService.enabledSlots", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(mealSlots).values([
      { key: "breakfast", label: "Breakfast", enabled: false, sortOrder: 0 },
      { key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 },
    ]);
  });
  afterAll(reset);

  it("returns only enabled slots in sort order", async () => {
    const slots = await mealSlotsService.enabledSlots();
    expect(slots.map((s) => s.key)).toEqual(["lunch"]);
  });
});
```

- [ ] **Step 4: Run — fails** — `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/meal-slots.service.test.ts` → FAIL (service missing).

- [ ] **Step 5: Implement** — `apps/web/lib/services/meal-slots.service.ts`

```ts
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSlots } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

class MealSlotsService extends SessionUpdatableService<typeof mealSlots> {
  async enabledSlots() {
    return db
      .select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder })
      .from(mealSlots)
      .where(eq(mealSlots.enabled, true))
      .orderBy(asc(mealSlots.sortOrder));
  }
}

const repo = new UpdatableRepository(db, mealSlots, mealSlots.id);
export const mealSlotsService = new MealSlotsService(repo);
```

- [ ] **Step 6: Run — passes** — same command → PASS.

- [ ] **Step 7: REST** — `apps/web/app/api/meal-slots/route.ts`

```ts
import { createCollectionRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
export const { GET, POST } = createCollectionRoute(mealSlotsService, { guard: () => requireAdmin() });
```

`apps/web/app/api/meal-slots/[id]/route.ts`:

```ts
import { createResourceRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
export const { GET, PUT, PATCH } = createResourceRoute(mealSlotsService, { guard: () => requireAdmin() });
```

- [ ] **Step 8: Seed + script** — `apps/web/db/seed-menu.ts`

```ts
import { db } from "./client";
import { mealSlots } from "./schema";

const SLOTS = [
  { key: "breakfast", label: "Breakfast", enabled: false, sortOrder: 0 },
  { key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
  { key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 },
];

async function main() {
  for (const s of SLOTS) {
    await db.insert(mealSlots).values(s).onConflictDoNothing({ target: mealSlots.key });
  }
  console.log(`Seeded ${SLOTS.length} meal slots`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Add to `apps/web/package.json` scripts: `"db:seed:menu": "tsx db/seed-menu.ts"`. Run:
`cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:menu`

- [ ] **Step 9: Admin settings page** — `apps/web/app/(dashboard)/dashboard/settings/meal-slots/actions.ts`

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSlotsService } from "@/lib/services/meal-slots.service";

export async function setSlotEnabled(id: string, enabled: boolean) {
  await requireAdmin();
  await mealSlotsService.update(id, { enabled });
  revalidatePath("/dashboard/settings/meal-slots");
}
```

`slot-toggle.tsx` (client): a `Switch` per slot calling `setSlotEnabled(id, checked)` in a transition + `router.refresh()`. `page.tsx` (server): `await requireAdmin()`, load all slots ordered by `sortOrder`, render label + toggle.

- [ ] **Step 10: Verify + commit**

Run (root): `pnpm test && pnpm typecheck && pnpm build`
```bash
git add apps/web/db apps/web/lib/services/meal-slots.service.ts apps/web/app/api/meal-slots apps/web/app/\(dashboard\)/dashboard/settings apps/web/package.json
git commit -m "feat(menu): meal_slots config + admin enable/disable settings"
```

---

### Task 2: `dishes` catalog + admin editor

**Files:**
- Modify: `apps/web/db/schema/menu.ts` (add dishes + `dish_diet` enum)
- Create: `apps/web/lib/services/dishes.service.ts`, `apps/web/app/api/dishes/{route,[id]/route,query/route}.ts`
- Create: `apps/web/app/(dashboard)/dashboard/dishes/{page.tsx,actions.ts,dishes-editor.tsx}`
- Test: `apps/web/lib/services/__tests__/dishes-soft-delete.test.ts`

**Interfaces:**
- Produces: `dishes` `{ id, name, description, diet('veg'|'nonveg'), slots text[], imageUrl, active, ...updatable }`; `dishesService` (SoftDeleteService — `delete` sets `active=false`). Consumed by Tasks 5 (menu builder) and 7 (selection).

- [ ] **Step 1: Schema** — append to `apps/web/db/schema/menu.ts`

```ts
import { boolean, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
// (pgEnum added to imports)

export const dishDiet = pgEnum("dish_diet", ["veg", "nonveg"]);

export const dishes = pgTable("dishes", {
  ...updatableColumns,
  name: text("name").notNull(),
  description: text("description"),
  diet: dishDiet("diet").notNull(),
  slots: text("slots").array().notNull().default([]),
  imageUrl: text("image_url"),
  active: boolean("active").notNull().default(true),
});
```

- [ ] **Step 2: Migrate** — `cd apps/web && pnpm db:generate --name dishes && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate`. Expected: creates `dish_diet` + `dishes`.

- [ ] **Step 3: Failing test** — `apps/web/lib/services/__tests__/dishes-soft-delete.test.ts`

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { dishesService } = await import("../dishes.service");

let id: string;
async function reset() { await db.delete(dishes); }
describe("dishesService soft-delete", () => {
  beforeEach(async () => {
    await reset();
    const [d] = await db.insert(dishes).values({ name: "Dal", diet: "veg", slots: ["lunch"] }).returning();
    id = d.id;
  });
  afterAll(reset);
  it("delete() flips active=false", async () => {
    await dishesService.delete(id);
    const [row] = await db.select().from(dishes).where(eq(dishes.id, id));
    expect(row.active).toBe(false);
  });
});
```

- [ ] **Step 4: Run — fails.**

- [ ] **Step 5: Implement** — `apps/web/lib/services/dishes.service.ts`

```ts
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

class DishesService extends SessionUpdatableService<typeof dishes> {
  async delete(id: string): Promise<number> {
    await this.update(id, { active: false });
    return 1;
  }
}
const repo = new UpdatableRepository(db, dishes, dishes.id);
export const dishesService = new DishesService(repo);
```

- [ ] **Step 6: Run — passes.**

- [ ] **Step 7: REST** — `apps/web/app/api/dishes/route.ts`, `[id]/route.ts`, `query/route.ts` (admin-guarded, same shape as Task 1 REST: collection `{GET,POST}`, resource `{GET,PUT,PATCH,DELETE}`, query `{POST}`, all `guard: () => requireAdmin()`, importing `dishesService`).

- [ ] **Step 8: Admin dishes page** — `apps/web/app/(dashboard)/dashboard/dishes/`:
  - `actions.ts`: `saveDish(id|null, patch)`, `retireDish(id)`, `reactivateDish(id)` — all `requireAdmin()`, call `dishesService`, `revalidatePath("/dashboard/dishes")`.
  - `page.tsx` (server): `await requireAdmin()`; load all dishes; render `<DishesEditor dishes={rows} />`.
  - `dishes-editor.tsx` (client): table of dishes (name, diet badge, slots, retired badge); add/edit form with name, description, diet `Select`(veg/nonveg), slots multiselect (checkboxes for breakfast/lunch/dinner), imageUrl; retire/reactivate buttons. Mirror the subsystem-D `resource-editor.tsx` pattern.

- [ ] **Step 9: Verify + commit**

Run (root): `pnpm test && pnpm typecheck && pnpm build`
```bash
git add apps/web/db apps/web/lib/services/dishes.service.ts apps/web/app/api/dishes apps/web/app/\(dashboard\)/dashboard/dishes
git commit -m "feat(menu): dishes catalog + admin editor (soft-delete)"
```

---

## Phase 2 — Order/pricing/wizard amendment (subsystem C)

### Task 3: `persons` + `mealSlots` across order, pricing, wizard

This is one cohesive task: it must land together to keep the build green (the `dailyQty`→`persons` rename in `PricingSelections` cascades through every consumer).

**Files:**
- Modify: `apps/web/lib/pricing/types.ts`, `engine.ts`, `build-catalog.ts`, `engine.test.ts`, `build-catalog.test.ts`
- Modify: `apps/web/db/schema/orders.ts`
- Create: `apps/web/db/migrations/NNNN_orders_persons_slots.sql` + snapshot/journal (hand-authored)
- Modify: `apps/web/lib/services/orders.service.ts`, `apps/web/app/(public)/checkout/actions.ts`, `apps/web/components/checkout/checkout.tsx`
- Modify: `apps/web/components/wizard/selections.ts`, `components/wizard/steps/step-schedule.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx` + its `page.tsx` (pass enabled slots)
- Test: pricing tests above + `apps/web/lib/services/__tests__/orders.service.test.ts` (already exists — update)

**Interfaces:**
- Produces: `PricingSelections` with `persons: number` and `mealSlots: string[]` (replacing `dailyQty`); `orders.persons`, `orders.mealSlots`. `createOrder`/wizard carry them.

- [ ] **Step 1: Pricing types** — `apps/web/lib/pricing/types.ts`: in `PricingSelections` replace `dailyQty: number;` with `persons: number;` and add `mealSlots: string[];`.

- [ ] **Step 2: Engine test** — update `apps/web/lib/pricing/engine.test.ts`: in the `sel()` helper replace `dailyQty: 1` with `persons: 1, mealSlots: ["lunch"]`; rename the `dailyQty: 3` case to `persons: 3`; add a case:

```ts
it("multiplies by meal-slot count", () => {
  const r = priceSubscription(sel({ persons: 2, mealSlots: ["lunch", "dinner"] }), baseCatalog(10));
  // 10 base × 5 days × 2 persons × 2 slots = 200
  expect(r.weeklyFee).toBe(200);
});
```

- [ ] **Step 3: Run — fails** (`persons`/`mealSlots` not on type / engine ignores slots).

- [ ] **Step 4: Engine** — `apps/web/lib/pricing/engine.ts`: change the meal subtotal line to multiply by persons × slots:

```ts
  const slotCount = Math.max(1, selections.mealSlots.length);
  const mealsSubtotal = round2(
    catalog.mealSize.basePrice * catalog.frequency.daysPerWeek * selections.persons * slotCount,
  );
  lineItems.push({
    label: `Meals (${catalog.frequency.daysPerWeek}d × ${selections.persons}p × ${slotCount} slot${slotCount > 1 ? "s" : ""}/wk)`,
    amount: mealsSubtotal,
  });
```

(Everything downstream — add-ons, discounts, weeklyFee, total × `selections.durationWeeks` — is unchanged.)

- [ ] **Step 5: build-catalog** — `apps/web/lib/pricing/build-catalog.ts`: rename the `MIN_DAILY_QTY`/`MAX_DAILY_QTY` validation to read `selections.persons`, and add a non-empty `mealSlots` guard:

```ts
  if (!Number.isInteger(selections.persons) || selections.persons < MIN_PERSONS || selections.persons > MAX_PERSONS) {
    throw new ValidationError(`Persons must be an integer ${MIN_PERSONS}–${MAX_PERSONS}`);
  }
  if (!Array.isArray(selections.mealSlots) || selections.mealSlots.length === 0) {
    throw new ValidationError("At least one meal slot is required");
  }
```

Rename the exported consts `MIN_DAILY_QTY`→`MIN_PERSONS` (1), `MAX_DAILY_QTY`→`MAX_PERSONS` (5). Update `build-catalog.test.ts` references.

- [ ] **Step 6: Run pricing tests — pass** — `cd apps/web && pnpm vitest run lib/pricing` → PASS.

- [ ] **Step 7: Orders schema** — `apps/web/db/schema/orders.ts`: rename field `dailyQty: integer("daily_qty")...` to `persons: integer("persons").notNull().default(1)`, and add:

```ts
  mealSlots: text("meal_slots").array().notNull().default(["lunch"]),
```

(import `text` is already present.)

- [ ] **Step 8: Hand-author the migration** — `drizzle-kit generate` would prompt (column rename). Create `apps/web/db/migrations/NNNN_orders_persons_slots.sql` (NNNN = next index):

```sql
ALTER TABLE "orders" RENAME COLUMN "daily_qty" TO "persons";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "meal_slots" text[] DEFAULT '{lunch}' NOT NULL;
```

Add the journal entry and a token-swapped snapshot copy (replace `daily_qty`→`persons`, add the `meal_slots` column) exactly as in the subsystem-D rename (script: copy prior `meta/<prev>_snapshot.json`, swap, new `id` + `prevId` = prior snapshot id). Apply:

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate` → applied. Existing rows keep their value as `persons` and get `meal_slots = {lunch}`.

- [ ] **Step 9: createOrder** — `apps/web/lib/services/orders.service.ts`: in the insert, change `dailyQty: input.selections.dailyQty` to `persons: input.selections.persons` and add `mealSlots: input.selections.mealSlots`. (`CreateOrderInput.selections` is `PricingSelections`, already updated.)

- [ ] **Step 10: Wizard selections** — `apps/web/components/wizard/selections.ts`: in `initialSelections` replace `dailyQty: 1` with `persons: 1, mealSlots: ["lunch"]`.

- [ ] **Step 11: Schedule step UI** — `apps/web/components/wizard/steps/step-schedule.tsx`:
  - relabel "Daily tiffins (1–5)" → "Persons (1–5)"; the +/- buttons set `persons` instead of `dailyQty` (`selections.persons`, `set({ persons: ... })`).
  - add a **meal-slots multiselect** sourced from enabled slots. The wizard is client-side; pass `enabledSlots` into the wizard from the server page. Add a checkbox group: each enabled slot toggles membership in `selections.mealSlots` (keep ≥1; default lunch). Thread `enabledSlots: {key,label}[]` through `wizard.tsx` props → `StepSchedule`. Source it in `app/(public)/subscribe/page.tsx` via `mealSlotsService.enabledSlots()`.

- [ ] **Step 12: Checkout + agent order forms** — `components/checkout/checkout.tsx` passes `selections` straight to `confirmSubscription`; no field change needed beyond the type rename compiling. The agent order form (`app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx`) currently builds `selections` with `dailyQty` — change to `persons` and add a `mealSlots` control (default `["lunch"]`, choosing among enabled slots passed from its `page.tsx` via `mealSlotsService.enabledSlots()`).

- [ ] **Step 13: Update orders.service test** — `apps/web/lib/services/__tests__/orders.service.test.ts`: in `baseInput.selections` replace `dailyQty: 1` with `persons: 1, mealSlots: ["lunch"]`.

- [ ] **Step 14: Full verify** — Run (root): `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm test && pnpm typecheck && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build`. Expected: all green (`rg -n "dailyQty" apps/web` returns nothing).

- [ ] **Step 15: Commit**

```bash
git add apps/web
git commit -m "feat(orders): persons + meal slots; pricing scales persons × slots × days"
```

---

## Phase 3 — Menu release + selection

### Task 4: `menu_weeks` + `menu_items` schema

**Files:**
- Modify: `apps/web/db/schema/menu.ts`
- Create migration (generated; new tables)

**Interfaces:**
- Produces: `menuWeeks` `{ id, weekStart(date), status('draft'|'released'), orderCutoff(timestamptz), releasedAt, ...updatable }`; `dayOfWeek` enum; `menuItems` `{ id, menuWeekId, dayOfWeek, slot, dishId, isDefault, ...updatable }`.

- [ ] **Step 1: Schema** — append to `apps/web/db/schema/menu.ts`

```ts
import { date, pgEnum, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { dishes } from "./menu"; // same file — reference the const directly

export const menuWeekStatus = pgEnum("menu_week_status", ["draft", "released"]);
export const dayOfWeek = pgEnum("day_of_week", ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

export const menuWeeks = pgTable("menu_weeks", {
  ...updatableColumns,
  weekStart: date("week_start").notNull().unique(),
  status: menuWeekStatus("status").notNull().default("draft"),
  orderCutoff: timestamp("order_cutoff", { withTimezone: true }).notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
});

export const menuItems = pgTable(
  "menu_items",
  {
    ...updatableColumns,
    menuWeekId: uuid("menu_week_id").notNull().references(() => menuWeeks.id, { onDelete: "cascade" }),
    dayOfWeek: dayOfWeek("day_of_week").notNull(),
    slot: text("slot").notNull(),
    dishId: uuid("dish_id").notNull().references(() => dishes.id),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [uniqueIndex("menu_items_unique").on(t.menuWeekId, t.dayOfWeek, t.slot, t.dishId)],
);
```

(Remove the self-import line — `dishes` is already in scope in the same file; it's listed only to note the FK target.)

- [ ] **Step 2: Migrate + typecheck** — `cd apps/web && pnpm db:generate --name menu_weeks_items && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate`; then root `pnpm typecheck`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/db
git commit -m "feat(menu): menu_weeks + menu_items schema"
```

---

### Task 5: Menu service + admin weekly builder

**Files:**
- Create: `apps/web/lib/services/menu.service.ts`
- Create: `apps/web/app/(dashboard)/dashboard/menus/{page.tsx,actions.ts,menu-builder.tsx}`
- Test: `apps/web/lib/services/__tests__/menu.service.test.ts`

**Interfaces:**
- Consumes: `menuWeeks`, `menuItems`, `mealSlotsService.enabledSlots`.
- Produces: `menuService` with `upsertWeek({ weekStart, orderCutoff })`, `addItem({ menuWeekId, dayOfWeek, slot, dishId, isDefault })` (rejects a disabled slot), `removeItem(id)`, `setDefault(itemId)`, `release(menuWeekId)`, `weekWithItems(menuWeekId)`.

- [ ] **Step 1: Failing test** — `apps/web/lib/services/__tests__/menu.service.test.ts`

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@tiffin/commons";
import { db } from "@/db/client";
import { dishes, mealSlots, menuItems, menuWeeks } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { menuService } = await import("../menu.service");

let weekId: string; let dishId: string;
async function reset() {
  await db.delete(menuItems); await db.delete(menuWeeks); await db.delete(dishes); await db.delete(mealSlots);
}
describe("menuService", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(mealSlots).values([{ key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 }, { key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 }]);
    const [d] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: ["lunch"] }).returning();
    dishId = d.id;
    const w = await menuService.upsertWeek({ weekStart: "2026-06-22", orderCutoff: new Date("2026-06-21T18:00:00Z").toISOString() });
    weekId = w.id;
  });
  afterAll(reset);

  it("adds an item for an enabled slot", async () => {
    await menuService.addItem({ menuWeekId: weekId, dayOfWeek: "mon", slot: "lunch", dishId, isDefault: true });
    const rows = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, weekId));
    expect(rows).toHaveLength(1);
  });
  it("rejects an item for a disabled slot", async () => {
    await expect(menuService.addItem({ menuWeekId: weekId, dayOfWeek: "mon", slot: "dinner", dishId, isDefault: false }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("release marks the week released", async () => {
    await menuService.release(weekId);
    const [w] = await db.select().from(menuWeeks).where(eq(menuWeeks.id, weekId));
    expect(w.status).toBe("released");
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement** — `apps/web/lib/services/menu.service.ts`

```ts
import { ValidationError } from "@tiffin/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSlots, menuItems, menuWeeks } from "@/db/schema";

export const menuService = {
  async upsertWeek(input: { weekStart: string; orderCutoff: string }) {
    const [existing] = await db.select().from(menuWeeks).where(eq(menuWeeks.weekStart, input.weekStart)).limit(1);
    if (existing) {
      const [u] = await db.update(menuWeeks).set({ orderCutoff: new Date(input.orderCutoff) }).where(eq(menuWeeks.id, existing.id)).returning();
      return u;
    }
    const [w] = await db.insert(menuWeeks).values({ weekStart: input.weekStart, orderCutoff: new Date(input.orderCutoff) }).returning();
    return w;
  },

  async addItem(input: { menuWeekId: string; dayOfWeek: "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"; slot: string; dishId: string; isDefault: boolean }) {
    const [slot] = await db.select().from(mealSlots).where(and(eq(mealSlots.key, input.slot), eq(mealSlots.enabled, true))).limit(1);
    if (!slot) throw new ValidationError("Slot is not enabled");
    const [row] = await db.insert(menuItems).values(input).onConflictDoNothing({
      target: [menuItems.menuWeekId, menuItems.dayOfWeek, menuItems.slot, menuItems.dishId],
    }).returning();
    return row ?? null;
  },

  async removeItem(id: string) { await db.delete(menuItems).where(eq(menuItems.id, id)); },

  async setDefault(itemId: string) {
    const [item] = await db.select().from(menuItems).where(eq(menuItems.id, itemId)).limit(1);
    if (!item) throw new ValidationError("Item not found");
    await db.update(menuItems).set({ isDefault: false })
      .where(and(eq(menuItems.menuWeekId, item.menuWeekId), eq(menuItems.dayOfWeek, item.dayOfWeek), eq(menuItems.slot, item.slot)));
    await db.update(menuItems).set({ isDefault: true }).where(eq(menuItems.id, itemId));
  },

  async release(menuWeekId: string) {
    await db.update(menuWeeks).set({ status: "released", releasedAt: new Date() }).where(eq(menuWeeks.id, menuWeekId));
  },

  async weekWithItems(menuWeekId: string) {
    const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.id, menuWeekId)).limit(1);
    const items = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, menuWeekId));
    return { week, items };
  },
};
```

(`menuService` is a plain object — no audit stamping needed for menu management; if `createdBy` is desired later, switch to a SessionUpdatableService. Keeping it plain avoids the NextAuth import in tests; the test still mocks `@/lib/auth` defensively in case schema imports pull it.)

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: Admin builder** — `apps/web/app/(dashboard)/dashboard/menus/`:
  - `actions.ts`: `requireAdmin()`-guarded wrappers `upsertWeek`, `addItem`, `removeItem`, `setDefault`, `releaseWeek`, each `revalidatePath("/dashboard/menus")`.
  - `page.tsx` (server): `await requireAdmin()`; load enabled slots, active dishes, and (if a `?week=` param) `weekWithItems`. Render a week picker (date input → `upsertWeek`) and, per `dayOfWeek` × enabled slot, the chosen dishes + an "add dish" control (select from active dishes matching the slot) + mark-default + remove; a **Release** button.
  - `menu-builder.tsx` (client): the grid + controls calling the actions.
  - Un-stub "Weekly Menus" in the sidebar (Task 9).

- [ ] **Step 6: Verify + commit**

Run (root): `pnpm test && pnpm typecheck && pnpm build`
```bash
git add apps/web/lib/services/menu.service.ts apps/web/app/\(dashboard\)/dashboard/menus
git commit -m "feat(menu): menu service + admin weekly builder/release"
```

---

### Task 6: `meal_selections` schema

**Files:** Modify `apps/web/db/schema/menu.ts`; generate migration.

**Interfaces:**
- Produces: `mealSelections` `{ id, orderId, menuWeekId, dayOfWeek, slot, personIndex(int), dishId, ...updatable }`, unique on (orderId, menuWeekId, dayOfWeek, slot, personIndex).

- [ ] **Step 1: Schema** — append to `menu.ts`

```ts
import { orders } from "./orders";

export const mealSelections = pgTable(
  "meal_selections",
  {
    ...updatableColumns,
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    menuWeekId: uuid("menu_week_id").notNull().references(() => menuWeeks.id),
    dayOfWeek: dayOfWeek("day_of_week").notNull(),
    slot: text("slot").notNull(),
    personIndex: integer("person_index").notNull(),
    dishId: uuid("dish_id").notNull().references(() => dishes.id),
  },
  (t) => [uniqueIndex("meal_selections_unique").on(t.orderId, t.menuWeekId, t.dayOfWeek, t.slot, t.personIndex)],
);
```

- [ ] **Step 2: Migrate + typecheck** — `cd apps/web && pnpm db:generate --name meal_selections && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate`; root `pnpm typecheck`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/db
git commit -m "feat(menu): meal_selections schema"
```

---

### Task 7: Delivery-days + selection service

**Files:**
- Create: `apps/web/lib/menu/delivery-days.ts`, `apps/web/lib/menu/selections.service.ts`
- Test: `apps/web/lib/menu/__tests__/delivery-days.test.ts`, `apps/web/lib/menu/__tests__/selections.service.test.ts`

**Interfaces:**
- Produces:
  - `orderDeliveryDays(o: { frequencyKey: string; includeSaturday: boolean; includeSunday: boolean }): DayOfWeek[]`
  - `visibleSlots(orderSlots: string[], enabled: string[], dayItems: { slot: string }[]): string[]`
  - `selectionsService.setSelection({ order, menuWeek, dayOfWeek, slot, personIndex, dishId })` — throws `ValidationError` if locked / dish not in day-slot menu / diet mismatch; upserts.
  - `selectionsService.effectiveSelections(orderId, menuWeekId, order)` — picks with default-fill.

- [ ] **Step 1: delivery-days test** — `apps/web/lib/menu/__tests__/delivery-days.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { orderDeliveryDays } from "../delivery-days";

describe("orderDeliveryDays", () => {
  it("5_day → mon..fri", () => {
    expect(orderDeliveryDays({ frequencyKey: "5_day", includeSaturday: false, includeSunday: false }))
      .toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });
  it("mwf → mon/wed/fri", () => {
    expect(orderDeliveryDays({ frequencyKey: "mwf", includeSaturday: false, includeSunday: false }))
      .toEqual(["mon", "wed", "fri"]);
  });
  it("adds weekend days", () => {
    expect(orderDeliveryDays({ frequencyKey: "5_day", includeSaturday: true, includeSunday: true }))
      .toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement delivery-days** — `apps/web/lib/menu/delivery-days.ts`

```ts
export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const FIVE_DAY: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];
const MWF: DayOfWeek[] = ["mon", "wed", "fri"];

export function orderDeliveryDays(o: { frequencyKey: string; includeSaturday: boolean; includeSunday: boolean }): DayOfWeek[] {
  const base = o.frequencyKey === "mwf" ? [...MWF] : [...FIVE_DAY];
  if (o.includeSaturday) base.push("sat");
  if (o.includeSunday) base.push("sun");
  return base;
}

export function visibleSlots(orderSlots: string[], enabled: string[], dayItems: { slot: string }[]): string[] {
  const offered = new Set(dayItems.map((i) => i.slot));
  return orderSlots.filter((s) => enabled.includes(s) && offered.has(s));
}
```

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: selections.service test** — `apps/web/lib/menu/__tests__/selections.service.test.ts`

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@tiffin/commons";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { selectionsService } = await import("../selections.service");

let order: typeof orders.$inferSelect; let week: typeof menuWeeks.$inferSelect; let vegDish: string; let nonvegDish: string;

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
  await db.delete(orders); await db.delete(dishes); await db.delete(users);
}

describe("selectionsService.setSelection", () => {
  beforeEach(async () => {
    await reset();
    const snap = await loadCatalogSnapshot();
    const [u] = await db.insert(users).values({ phone: "+16475557000", role: "user" }).returning();
    const [o] = await db.insert(orders).values({
      userId: u.id, planId: snap.plans.find((p) => p.key === "veg")!.id, mealSizeId: snap.mealSizes[0].id,
      frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id, persons: 1, mealSlots: ["lunch"],
      durationWeeks: 1, pricingSnapshot: {}, weeklyFee: "10.00", total: "10.00", status: "active",
      deploymentId: "SUB-TEST01", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    order = o;
    const [w] = await db.insert(menuWeeks).values({ weekStart: "2026-06-22", status: "released", orderCutoff: new Date("2999-01-01") }).returning();
    week = w;
    const [vd] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: ["lunch"] }).returning();
    const [nd] = await db.insert(dishes).values({ name: "Chicken", diet: "nonveg", slots: ["lunch"] }).returning();
    vegDish = vd.id; nonvegDish = nd.id;
    await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "lunch", dishId: vegDish, isDefault: true });
  });
  afterAll(reset);

  it("saves a valid pick", async () => {
    await selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishId: vegDish });
    const [row] = await db.select().from(mealSelections).where(eq(mealSelections.orderId, order.id));
    expect(row.dishId).toBe(vegDish);
  });
  it("rejects a dish not on that day/slot menu", async () => {
    await expect(selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishId: nonvegDish }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects after cutoff (locked)", async () => {
    const locked = { ...week, orderCutoff: new Date("2000-01-01") };
    await expect(selectionsService.setSelection({ order, menuWeek: locked, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishId: vegDish }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});
```

(Diet-mismatch is exercised indirectly: the non-veg dish is on the menu in a separate menu_item only if added; here it's rejected as "not on menu". A dedicated diet test can add the non-veg dish to the menu then assert rejection for a veg plan.)

- [ ] **Step 6: Run — fails.**

- [ ] **Step 7: Implement selections.service** — `apps/web/lib/menu/selections.service.ts`

```ts
import { ValidationError } from "@tiffin/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, plans } from "@/db/schema";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Order = typeof orders.$inferSelect;
type Week = typeof menuWeeks.$inferSelect;

function dietsForPlanKey(planKey: string): ("veg" | "nonveg")[] {
  if (planKey === "veg") return ["veg"];
  if (planKey === "halal_nonveg") return ["nonveg"];
  return ["veg", "nonveg"]; // mixed
}

export const selectionsService = {
  async setSelection(input: { order: Order; menuWeek: Week; dayOfWeek: Day; slot: string; personIndex: number; dishId: string }) {
    const { order, menuWeek, dayOfWeek, slot, personIndex, dishId } = input;
    if (new Date() > new Date(menuWeek.orderCutoff)) throw new ValidationError("Selections are locked for this week");
    if (personIndex < 1 || personIndex > order.persons) throw new ValidationError("Invalid person");

    // Dish must be on the menu for this day/slot.
    const [item] = await db.select().from(menuItems).where(and(
      eq(menuItems.menuWeekId, menuWeek.id), eq(menuItems.dayOfWeek, dayOfWeek), eq(menuItems.slot, slot), eq(menuItems.dishId, dishId),
    )).limit(1);
    if (!item) throw new ValidationError("Dish is not available for that day and slot");

    // Diet must match the order's plan.
    const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.id, order.planId)).limit(1);
    const [dish] = await db.select({ diet: dishes.diet }).from(dishes).where(eq(dishes.id, dishId)).limit(1);
    if (!plan || !dish || !dietsForPlanKey(plan.key).includes(dish.diet)) throw new ValidationError("Dish does not match your plan");

    await db.insert(mealSelections).values({ orderId: order.id, menuWeekId: menuWeek.id, dayOfWeek, slot, personIndex, dishId })
      .onConflictDoUpdate({
        target: [mealSelections.orderId, mealSelections.menuWeekId, mealSelections.dayOfWeek, mealSelections.slot, mealSelections.personIndex],
        set: { dishId },
      });
  },

  async effectiveSelections(orderId: string, menuWeekId: string) {
    const picks = await db.select().from(mealSelections)
      .where(and(eq(mealSelections.orderId, orderId), eq(mealSelections.menuWeekId, menuWeekId)));
    return picks; // default-fill is applied in the grid loader (Task 8) using menu_items.isDefault
  },
};
```

- [ ] **Step 8: Run — passes.**

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/menu
git commit -m "feat(menu): delivery-days + selection service (locked save, diet/menu validation)"
```

---

### Task 8: Customer "My meals" page

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/meals/{page.tsx,actions.ts,meals-grid.tsx}`

**Interfaces:**
- Consumes: `orderDeliveryDays`, `visibleSlots`, `selectionsService`, `mealSlotsService.enabledSlots`, `menuService.weekWithItems`.

- [ ] **Step 1: Action** — `apps/web/app/(dashboard)/dashboard/meals/actions.ts`

```ts
"use server";
import { revalidatePath } from "next/cache";
import { AuthError, ValidationError } from "@tiffin/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { menuWeeks, orders } from "@/db/schema";
import { auth } from "@/lib/auth";
import { selectionsService } from "@/lib/menu/selections.service";

export async function pickDish(input: { orderId: string; menuWeekId: string; dayOfWeek: "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"; slot: string; personIndex: number; dishId: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError();
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) throw new ValidationError("Order not found");
  const isStaff = session.user.role === "admin" || session.user.role === "member";
  if (order.userId !== session.user.id && !isStaff) throw new AuthError();
  const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.id, input.menuWeekId)).limit(1);
  if (!week) throw new ValidationError("Menu week not found");
  await selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: input.dayOfWeek, slot: input.slot, personIndex: input.personIndex, dishId: input.dishId });
  revalidatePath("/dashboard/meals");
}
```

- [ ] **Step 2: Page (server)** — `page.tsx`: `auth()`-gate; load the session user's most recent `active` order; the latest `released` `menu_weeks`; `weekWithItems`; `enabledSlots`. Compute `orderDeliveryDays(order)`. For each day × `visibleSlots` × person, find the current pick (from `selectionsService.effectiveSelections`) or the `isDefault` menu item; pass to `<MealsGrid />`. Show a "locked" banner if `now > orderCutoff`. If no active order or no released week, render an empty-state with a CTA to `/subscribe` or "menu coming soon".

- [ ] **Step 3: Grid (client)** — `meals-grid.tsx`: render day rows; per slot/person a `Select` of diet-matching dishes for that day/slot, defaulting to current/`isDefault`; on change call `pickDish`; disabled when locked. Surface `ValidationError` messages inline.

- [ ] **Step 4: Verify + commit**

Run (root): `pnpm test && pnpm typecheck && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build`
```bash
git add apps/web/app/\(dashboard\)/dashboard/meals
git commit -m "feat(menu): customer My-meals selection grid"
```

---

## Phase 4 — Nav, seed, verify

### Task 9: Sidebar nav + role gating

**Files:** Modify `apps/web/components/dashboard/app-sidebar.tsx`.

- [ ] **Step 1: Add nav items** — extend `NAV` (the existing role-aware array):

```tsx
{ title: "Dishes", href: "/dashboard/dishes", icon: SaladIcon, roles: ["admin"] },
{ title: "Weekly Menus", href: "/dashboard/menus", icon: CalendarIcon, roles: ["admin"] },
{ title: "Meal slots", href: "/dashboard/settings/meal-slots", icon: SettingsIcon, roles: ["admin"] },
{ title: "My meals", href: "/dashboard/meals", icon: UtensilsCrossedIcon, roles: ["user"] },
```

Import `SaladIcon`, `CalendarIcon`, `SettingsIcon` from `lucide-react` (keep existing imports). Place "My meals" near Account; admin items grouped with Catalog.

- [ ] **Step 2: Verify + commit**

Run (root): `pnpm build`
```bash
git add apps/web/components/dashboard/app-sidebar.tsx
git commit -m "feat(menu): sidebar nav for dishes, menus, meal slots, my meals"
```

### Task 10: Seed + final verification

**Files:** Modify `apps/web/db/seed-menu.ts` (add dishes + a sample released week).

- [ ] **Step 1: Extend seed** — after the slots seed in `db/seed-menu.ts`, insert a handful of `dishes` (veg + nonveg, slot `lunch`), one `menu_weeks` row (next Monday `weekStart`, `status: "released"`, `orderCutoff` a few days out), and `menu_items` for mon–fri lunch (mark one `isDefault`). Use `onConflictDoNothing`/idempotent guards (skip if the week already exists).

- [ ] **Step 2: Run seeds**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed && DATABASE_URL="..." pnpm db:seed:catalog && DATABASE_URL="..." pnpm db:seed:menu && DATABASE_URL="..." pnpm db:seed:admin`
Expected: idempotent, no errors.

- [ ] **Step 3: Full verify**

Run (root): `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm test && pnpm typecheck && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build`
Expected: all green; routes include `/dashboard/dishes`, `/dashboard/menus`, `/dashboard/settings/meal-slots`, `/dashboard/meals`.

- [ ] **Step 4: Manual smoke (document; needs dev server + login)**:
  1. Admin: `/dashboard/settings/meal-slots` enable dinner; `/dashboard/dishes` add a dish; `/dashboard/menus` build + release a week with a cutoff in the future.
  2. New order via `/subscribe`: persons + meal-slot multiselect appear; invoice scales with persons × slots; checkout completes.
  3. Customer `/dashboard/meals`: pick dishes per day/slot/person; confirm a non-matching dish is rejected; set cutoff to the past and confirm the grid locks and shows defaults.

- [ ] **Step 5: Commit**

```bash
git add apps/web/db/seed-menu.ts
git commit -m "chore(seed): sample dishes + released week for the menu engine"
```

---

## Self-review notes

- **Spec coverage:** §2 persons/slots/pricing → Task 3; §3.1 meal_slots → Task 1; §3.2 dishes → Task 2; §3.3–3.4 menu_weeks/items → Tasks 4–5; §3.5 meal_selections → Task 6; §3.6 orders amendment + migration/backfill → Task 3 (Steps 7–8); §4 pricing → Task 3; §5 delivery-days/selection/menu services → Tasks 5 + 7; §6 REST/pages/access → Tasks 1,2,5,8,9; §7 testing → TDD in Tasks 1,2,3,5,7 + Task 10 smoke; §8 risks (hand-authored rename, shared delivery-days, non-retroactive slots, lock race, server validation) → Tasks 3,7.
- **Type consistency:** `PricingSelections.persons` + `mealSlots` used identically in engine, build-catalog, wizard `selections.ts`, `createOrder`, and both order tests (Task 3). `orderDeliveryDays`/`visibleSlots` signatures match between Task 7 definition and Task 8 usage. `selectionsService.setSelection` arg shape matches Task 7 (test + impl) and Task 8 (action). `menuService` method names (`upsertWeek`/`addItem`/`removeItem`/`setDefault`/`release`/`weekWithItems`) consistent across Tasks 5 + 8.
- **Migrations:** Task 3 (orders rename) is hand-authored per the Global Constraints; Tasks 1/2/4/6 are new tables/columns → generated non-interactively.
- **DB-backed tests/builds** pass `DATABASE_URL=...` and seed catalog/slots where needed.
