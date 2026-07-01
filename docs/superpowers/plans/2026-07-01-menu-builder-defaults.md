# Menu Builder Defaults + Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins mark one dish per (day × slot) as the default in the weekly menu builder, and revamp the builder UI, so the already-wired customer-grid default fallback (`meals-grid.ts:137`) actually fires.

**Architecture:** Reuse the existing `menuItems.isDefault` column — no schema change. Add a `menuService.setDefault` method that enforces one default per cell in a transaction (draft-only), a thin `setDefault` server action, thread `isDefault` from the page down to the client `MenuBuilder`, and add a star toggle per dish row plus a visual polish pass.

**Tech Stack:** Next.js (App Router, server actions), Drizzle ORM, Postgres, vitest (live-DB harness), shadcn/ui, lucide-react.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-01-menu-builder-defaults-design.md`.
- Admin/staff surface — desktop-primary. Keep responsive, don't regress tablet. (Mobile-first is a Spec-2 requirement, not here.)
- All service writes follow the commons convention; bulk position/flag updates use raw `db.update` documented as unaudited, matching the existing `reorderItems` pattern (`menu.service.ts:51-54`). See [[services-extend-commons-convention]].
- Invariant: **at most one `isDefault = true` per `(menuWeekId, dayOfWeek, slot)`**.
- Default-setting is **draft-only**. Reject on a released week.
- No `Co-Authored-By` trailer in commits. See [[no-claude-coauthor-commits]].
- Tests hit the real seeded Postgres; never delete `usr_system` (`users.isSystem = true`). Run with the repo's env-file. See [[live-db-test-harness]].

---

### Task 1: `menuService.setDefault` (service + test)

**Files:**
- Modify: `apps/web/lib/services/menu.service.ts` (add method after `reorderItems`, ~line 54)
- Test: `apps/web/lib/services/__tests__/menu-set-default.service.test.ts`

**Interfaces:**
- Consumes: `db`, `menuItems`, `menuWeeks` from `@/db/schema`; `and, eq` from `drizzle-orm`; `ValidationError` from `@tiffin/commons` (all already imported in `menu.service.ts`).
- Produces: `menuService.setDefault(input: { itemId: string }): Promise<void>` — `itemId` is a `menuItems.publicId`. Toggles: if the item is not currently default, clears siblings in its cell and sets it default; if it is already default, clears it (no default remains). Throws `ValidationError` if the item is missing or its week is not `draft`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/services/__tests__/menu-set-default.service.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { ValidationError } from "@tiffin/commons";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { menuService } = await import("../menu.service");

let weekId: bigint;
let itemA: typeof menuItems.$inferSelect;
let itemB: typeof menuItems.$inferSelect;

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
  await db.delete(orders); await db.delete(dishes); await db.delete(users).where(ne(users.isSystem, true));
}

async function seedDraftCell() {
  const [w] = await db.insert(menuWeeks).values({
    weekStart: "2999-01-04", status: "draft", orderCutoff: new Date("2999-01-01").getTime(),
  }).returning();
  weekId = w.id;
  const [d1] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: ["lunch"] }).returning();
  const [d2] = await db.insert(dishes).values({ name: "Dal", diet: "veg", slots: ["lunch"] }).returning();
  const [a] = await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "lunch", dishId: d1.id, isDefault: false, position: 0 }).returning();
  const [b] = await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "lunch", dishId: d2.id, isDefault: false, position: 1 }).returning();
  itemA = a; itemB = b;
}

async function isDefaultOf(id: bigint): Promise<boolean> {
  const [row] = await db.select({ isDefault: menuItems.isDefault }).from(menuItems).where(eq(menuItems.id, id));
  return row.isDefault;
}

describe("menuService.setDefault", () => {
  beforeEach(async () => { await reset(); await seedDraftCell(); });
  afterAll(reset);

  it("marks one item default", async () => {
    await menuService.setDefault({ itemId: itemA.publicId });
    expect(await isDefaultOf(itemA.id)).toBe(true);
    expect(await isDefaultOf(itemB.id)).toBe(false);
  });

  it("moving default to a sibling unsets the previous one", async () => {
    await menuService.setDefault({ itemId: itemA.publicId });
    await menuService.setDefault({ itemId: itemB.publicId });
    expect(await isDefaultOf(itemA.id)).toBe(false);
    expect(await isDefaultOf(itemB.id)).toBe(true);
  });

  it("setting default on the current default toggles it off", async () => {
    await menuService.setDefault({ itemId: itemA.publicId });
    await menuService.setDefault({ itemId: itemA.publicId });
    expect(await isDefaultOf(itemA.id)).toBe(false);
  });

  it("removing a default leaves the cell with no default", async () => {
    await menuService.setDefault({ itemId: itemA.publicId });
    await menuService.removeItem(itemA.publicId);
    const rows = await db.select().from(menuItems).where(and(eq(menuItems.menuWeekId, weekId), eq(menuItems.isDefault, true)));
    expect(rows).toHaveLength(0);
  });

  it("rejects setting default on a released week", async () => {
    await db.update(menuWeeks).set({ status: "released" }).where(eq(menuWeeks.id, weekId));
    await expect(menuService.setDefault({ itemId: itemA.publicId })).rejects.toBeInstanceOf(ValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run lib/services/__tests__/menu-set-default.service.test.ts`
Expected: FAIL — `menuService.setDefault is not a function`.

(If the repo needs an env-file for the DB, use the same invocation the other service tests use, e.g. `pnpm test -- lib/services/__tests__/menu-set-default.service.test.ts`; the `test` script is `vitest run`.)

- [ ] **Step 3: Write minimal implementation**

In `apps/web/lib/services/menu.service.ts`, add this method right after `reorderItems` (after line 54):

```typescript
  async setDefault(input: { itemId: string }) {
    const [item] = await db
      .select({
        id: menuItems.id,
        menuWeekId: menuItems.menuWeekId,
        dayOfWeek: menuItems.dayOfWeek,
        slot: menuItems.slot,
        isDefault: menuItems.isDefault,
        weekStatus: menuWeeks.status,
      })
      .from(menuItems)
      .innerJoin(menuWeeks, eq(menuItems.menuWeekId, menuWeeks.id))
      .where(eq(menuItems.publicId, input.itemId))
      .limit(1);
    if (!item) throw new ValidationError("Menu item not found");
    if (item.weekStatus !== "draft") throw new ValidationError("Defaults can only be set on a draft week");

    const wasDefault = item.isDefault;
    // One default per (week, day, slot); toggle off if it was already default.
    // Raw bulk update, NOT audited — matches the reorderItems pattern above.
    await db.transaction(async (tx) => {
      await tx.update(menuItems).set({ isDefault: false }).where(and(
        eq(menuItems.menuWeekId, item.menuWeekId),
        eq(menuItems.dayOfWeek, item.dayOfWeek),
        eq(menuItems.slot, item.slot),
      ));
      if (!wasDefault) {
        await tx.update(menuItems).set({ isDefault: true }).where(eq(menuItems.id, item.id));
      }
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run lib/services/__tests__/menu-set-default.service.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/menu.service.ts apps/web/lib/services/__tests__/menu-set-default.service.test.ts
git commit -m "feat(menu): setDefault marks one default dish per day/slot cell"
```

---

### Task 2: `setDefault` server action + thread `isDefault` to the builder UI

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/menus/actions.ts` (add action)
- Modify: `apps/web/app/(dashboard)/dashboard/menus/page.tsx:29-40` (add `isDefault` to the mapped item)
- Modify: `apps/web/app/(dashboard)/dashboard/menus/menu-builder.tsx` (Item type + star toggle UI)

**Interfaces:**
- Consumes: `menuService.setDefault` (Task 1); `requireAdmin` from `@/lib/auth/guards`; existing `revalidate()` helper in `actions.ts`.
- Produces: `setDefault(itemId: string): Promise<void>` server action; `Item` type in `menu-builder.tsx` gains `isDefault: boolean`.

- [ ] **Step 1: Add the server action**

In `apps/web/app/(dashboard)/dashboard/menus/actions.ts`, add after `removeItem`:

```typescript
export async function setDefault(itemId: string) {
  await requireAdmin();
  await menuService.setDefault({ itemId });
  revalidate();
}
```

- [ ] **Step 2: Thread `isDefault` from the page to the client**

In `apps/web/app/(dashboard)/dashboard/menus/page.tsx`, update the `items` type annotation and the map (lines 29 and 37-40):

Change the declaration:
```typescript
  let items: { id: string; dayOfWeek: string; slot: string; dishId: string; position: number; isDefault: boolean }[] = [];
```

Change the map body:
```typescript
      items = result.items.flatMap((i) => {
        const dishId = byId.get(i.dishId);
        return dishId ? [{ id: i.publicId, dayOfWeek: i.dayOfWeek, slot: i.slot, dishId, position: i.position, isDefault: i.isDefault }] : [];
      });
```

(`result.items` come from `weekWithItems` → `db.select().from(menuItems)`, so `i.isDefault` is present.)

- [ ] **Step 3: Add `isDefault` to the client Item type + render the toggle**

In `apps/web/app/(dashboard)/dashboard/menus/menu-builder.tsx`:

1. Update the `Item` type (line 20):
```typescript
type Item = { id: string; dayOfWeek: string; slot: string; dishId: string; position: number; isDefault: boolean };
```

2. Add `setDefault` to the actions import (line 14):
```typescript
import { addItem, createDish, releaseWeek, removeItem, setDefault, upsertWeek } from "./actions";
```

3. Add the `Star` icon to the lucide import (line 5):
```typescript
import { CheckCircle2, Star, X } from "lucide-react";
```

4. In the dish-row markup (the `ci.map((i) => ...)` block, lines 147-165), insert a star toggle button before the existing remove button, and a "Default" affordance. Replace the inner row `<div>` (lines 150-163) with:

```tsx
                              <div key={i.id} className={`group flex items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-1 text-sm ${i.isDefault ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40"}`}>
                                <span aria-hidden className={`size-2 shrink-0 rounded-full ${dietDotClass(d?.diet ?? "nonveg", d?.name ?? "")}`} />
                                <span className="flex-1 text-pretty">{d?.name ?? i.dishId}</span>
                                {i.isDefault && (
                                  <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">Default</span>
                                )}
                                {week.status === "draft" && (
                                  <button
                                    className={`flex size-8 shrink-0 items-center justify-center rounded-md transition-colors active:scale-[0.96] disabled:opacity-50 ${i.isDefault ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary"}`}
                                    disabled={pending}
                                    aria-pressed={i.isDefault}
                                    aria-label={i.isDefault ? `Unset ${d?.name ?? "dish"} as default` : `Set ${d?.name ?? "dish"} as default`}
                                    title={i.isDefault ? "Default for this day & slot" : "Set as default"}
                                    onClick={() => run(() => setDefault(i.id))}
                                  >
                                    <Star className={`size-3.5 ${i.isDefault ? "fill-current" : ""}`} />
                                  </button>
                                )}
                                {week.status === "draft" && (
                                  <button
                                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive active:scale-[0.96] disabled:opacity-50"
                                    disabled={pending}
                                    aria-label={`Remove ${d?.name ?? "dish"}`}
                                    onClick={() => run(() => removeItem(i.id))}
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                )}
                              </div>
```

- [ ] **Step 4: Verify in the app**

Run: `cd apps/web && pnpm dev`, open `/dashboard/menus?type=tiffin`, create/open a **draft** week, add two dishes to a cell.
Expected: hovering a dish reveals a star; clicking it fills the star, shows a "Default" chip, and highlights the row; starring the sibling moves the default; clicking the starred dish's star again clears it. On a **released** week, no star is shown.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(dashboard)/dashboard/menus/actions.ts apps/web/app/(dashboard)/dashboard/menus/page.tsx apps/web/app/(dashboard)/dashboard/menus/menu-builder.tsx
git commit -m "feat(menu): admin can set a default dish per day/slot in the builder"
```

---

### Task 3: Wire drag-to-reorder (optional — cut if descoping)

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/menus/actions.ts` (add `reorderItems` action)
- Modify: `apps/web/app/(dashboard)/dashboard/menus/menu-builder.tsx` (reorder interaction)

**Interfaces:**
- Consumes: `menuService.reorderItems({ menuWeekId, dayOfWeek, slot, orderedItemIds })` — already exists (`menu.service.ts:51`), currently unused by any UI.
- Produces: `reorderItems(input: { menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; orderedItemIds: string[] }): Promise<void>` server action.

> This wires an existing, tested-by-absence backend capability. If skipping, delete this task; nothing else depends on it.

- [ ] **Step 1: Add the server action**

In `actions.ts`, add:
```typescript
export async function reorderItems(input: { menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; orderedItemIds: string[] }) {
  await requireAdmin();
  await menuService.reorderItems(input);
  revalidate();
}
```

- [ ] **Step 2: Add reorder controls**

In each dish row (draft only), add up/down move buttons (simplest, no drag lib — YAGNI). Inside `mealType.slots.map`, compute the ordered ids per cell and add handlers that reorder within `ci`:

```tsx
                          {ci.map((i, idx) => {
                            const move = (dir: -1 | 1) => {
                              const ids = ci.map((x) => x.id);
                              const j = idx + dir;
                              if (j < 0 || j >= ids.length) return;
                              [ids[idx], ids[j]] = [ids[j], ids[idx]];
                              run(() => reorderItems({ menuWeekId: week.id, dayOfWeek: storeDay, slot: slot.key, orderedItemIds: ids }));
                            };
                            // ...existing row, add two small buttons calling move(-1) / move(1),
                            // disabled at idx===0 / idx===ci.length-1 respectively.
                          })}
```

Add `reorderItems` to the actions import and `ChevronUp, ChevronDown` to the lucide import. Wire the two buttons with `aria-label="Move up"/"Move down"`, `disabled={pending || idx === 0}` and `disabled={pending || idx === ci.length - 1}`.

- [ ] **Step 3: Verify in the app**

Open a draft week cell with 2+ dishes; move a dish up/down; refresh — order persists (`position` written).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(dashboard)/dashboard/menus/actions.ts apps/web/app/(dashboard)/dashboard/menus/menu-builder.tsx
git commit -m "feat(menu): wire dish reorder in the builder (existing service, no UI before)"
```

---

### Task 4: Visual polish pass

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/menus/menu-builder.tsx`

**REQUIRED SUB-SKILL:** invoke `make-interfaces-feel-better` before this task and apply its principles to the concrete deltas below.

- [ ] **Step 1: Apply the polish deltas**

Concrete changes (no behavior change — visual only):
1. **Empty-slot state:** when a cell has no items, show a muted hint instead of only the add control, e.g. a `<p className="text-xs text-muted-foreground/70">No dish yet</p>` above the add `Select`.
2. **Stagger enter:** wrap dish rows so newly added rows animate in — add `animate-in fade-in slide-in-from-top-1 duration-200` (tailwindcss-animate, already available via shadcn) to each row div.
3. **Tabular nums + optical alignment:** confirm the per-day count uses `tabular-nums` (already at line 138); align the day-card header baseline with the count.
4. **Status bar:** give the draft/released bar a subtle left accent border (`border-l-2 border-l-ok` for released, `border-l-muted-foreground/30` for draft) to reinforce state at a glance.
5. **Poster preview label:** keep the sticky preview; ensure the "Live preview" label has consistent spacing with the left column header.

- [ ] **Step 2: Verify in the app**

Open `/dashboard/menus`, confirm: empty cells read clearly, adding a dish animates in, released vs draft is visually distinct, layout is intact at tablet width (`md`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(dashboard)/dashboard/menus/menu-builder.tsx
git commit -m "polish(menu): builder empty states, enter motion, status accents"
```

---

## Self-Review

**Spec coverage:**
- Data model (reuse `isDefault`, one-per-cell) → Task 1. ✅
- Service `setDefault` (toggle, draft-only, atomic) → Task 1 + test. ✅
- Server action → Task 2. ✅
- Consumption note (`meals-grid.ts:137` already reads default; fulfillment checkpoint) → carried in the spec, verified downstream in Spec 2; no code here. ✅
- UX: default control → Task 2; reorder (optional) → Task 3; polish → Task 4. ✅
- Edge cases (atomic unset, weekend-under-`sat`, draft-only, remove clears default) → Task 1 tests cover atomic unset, draft-only, remove-clears; weekend cell uses `storeDay` already in the add path so the star operates on the same stored row. ✅

**Placeholder scan:** none — all steps carry real code or concrete class deltas.

**Type consistency:** `setDefault({ itemId })` used identically in service, action, and UI; `Item.isDefault: boolean` added in page map + client type; `reorderItems` signature matches the existing service method.
