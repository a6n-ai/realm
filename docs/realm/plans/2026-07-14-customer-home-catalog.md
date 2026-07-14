# Customer Home + Catalog Browse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three browse sections to the customer home (`/me`) — this-week menu (dish photos), meal sizes (spec cards + dish-photo slideshow), and a dish gallery — with a shared dish modal, reusing Slice-0 motion.

**Architecture:** RSC sections in `components/customer/home/`, each its own `<Suspense>` island in `me/page.tsx` (existing pattern). One new read (`listActiveWithImages`) feeds the dish gallery + meal-size slideshows; `getPublishedWeek`'s select is extended to carry dish image + publicId for the this-week section. No DB schema change, no new routes (detail is a modal).

**Tech Stack:** Next.js 16, React 19, Drizzle-Postgres, Vitest (live-DB services + jsdom components), Slice-0 `@/components/motion`, `@realm/ui` dialog/drawer, `@realm/storage` `FileDetail`.

## Global Constraints

- All code in `apps/tiffin-grab`. **No DB schema change.** No new routes.
- Meal sizes get NO image column — spec cards + a slideshow of dish photos (shared pool). Dish gallery + slideshows draw from ALL active dishes with a non-null image (dishes are NOT cleanly plan-typed).
- This-week menu is plan-type-scoped via `getPublishedWeek(planType)`, planType = customer's active-subscription plan type else `"tiffin"`.
- `"use client"` on every client component (tsc can't catch a missing directive). Compose classNames via `cn` from `@realm/ui/cn`. Honor reduced-motion (slideshow static, via `useReducedMotion` from `motion/react`).
- Dish image renders via `image.url` through the existing `/api/files/[...key]` route; imageless dishes render the `hueFromKey` gradient fallback (reuse `components/customer/home/plan-hero.tsx` `hueFromKey`).
- `FileDetail` type from `@realm/storage/model`. `PlanType`/`DayOfWeek` from the menu service's existing imports.
- Pricing/amounts are display-only from the snapshot — never computed client-side (AGENTS.md).
- Live-DB service tests run against the LOCAL dev DB (`DATABASE_URL`/`REDIS_URL` from vitest.config), serial. If the DB is down, the implementer FLAGS it — never deletes/skips assertions.
- Verify gate after each task: `pnpm --filter tiffin-grab exec tsc --noEmit` + the task test. Final task: `pnpm turbo typecheck && pnpm turbo test`.
- Worktree `/Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4`, branch `wt/slice1-home`. node_modules installed.

## Live-DB seed reference (Tasks 1, 2)

Direct-insert seeding (dishes/menu are simple tables; no `createOrder` needed). Serial suites → a scoped wipe is safe.

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
const { db } = await import("@/db/client");
const { dishes, menuWeeks, menuItems } = await import("@/db/schema");

const IMG = { url: "/api/files/x.jpg", filePath: "x.jpg", fileName: "x.jpg", type: "image/jpeg", size: 1 };

// Clean up only the rows this suite creates (match on a test-unique name prefix).
async function wipe() {
  await db.delete(menuItems);            // no unique test marker; safe on serial local DB
  await db.delete(menuWeeks);
  await db.delete(dishes).where(eq(dishes.name, "TEST_DISH_A")); // scope dish cleanup to our names
  await db.delete(dishes).where(eq(dishes.name, "TEST_DISH_B"));
}
```

(If a broader wipe is needed, mirror Slice-4's `reset()` in `app/(customer)/me/deliveries/__tests__/actions.test.ts`. Prefer name-scoped deletes for dishes so other seed data survives.)

## File Structure

- `lib/services/menu.service.ts` — extend `getPublishedWeek` select + `PosterItem` (add optional `image`, `dishPublicId`).
- `lib/services/dishes.service.ts` — add `listActiveWithImages()` + `CustomerDish` type.
- `components/customer/home/dish-image.tsx` — `<DishImage>` (photo or gradient fallback).
- `components/customer/home/dish-modal.tsx` — `<DishModal>` (photo/desc/diet/days).
- `components/customer/home/this-week-menu-section.tsx` — this-week section (+ Skeleton).
- `components/customer/home/dish-slideshow.tsx` — `<DishSlideshow>`.
- `components/customer/home/meal-sizes-section.tsx` — meal-size cards + slideshow (+ Skeleton).
- `components/customer/home/dishes-section.tsx` — dish gallery (+ Skeleton).
- `app/(customer)/me/home-sections.ts` — add 3 keys.
- `app/(customer)/me/page.tsx` — 3 loaders + islands, planType resolve, days-on-menu map.
- Tests colocated in each area's `__tests__/`.

---

### Task 1: Extend `getPublishedWeek` with dish image + publicId

**Files:**
- Modify: `apps/tiffin-grab/lib/services/menu.service.ts`
- Test: `apps/tiffin-grab/lib/services/__tests__/published-week-image.test.ts`

**Interfaces:**
- Produces: `PosterItem` gains `image?: FileDetail | null` and `dishPublicId?: string`. `getPublishedWeek` populates both on each item. The other builder (`listWeeks`, which also produces `PosterItem[]`) leaves them undefined (fields are optional → no change required there).

- [ ] **Step 1: Read** `lib/services/menu.service.ts` — locate the `PosterItem` type and the `getPublishedWeek` inner `db.select({...})` on `menuItems` innerJoin `dishes` (selects `dayOfWeek, slot, position, dishName, diet`). Confirm `dishes.image` + `dishes.publicId` columns exist.

- [ ] **Step 2: Write the failing test**

Create `apps/tiffin-grab/lib/services/__tests__/published-week-image.test.ts` using the seed reference above. Seed a released `menu_weeks` (planType "tiffin", some `weekStart`, `status:"released"`) + a dish (`name:"TEST_DISH_A"`, `diet:"veg"`, `image: IMG`, `active:true`) + a `menu_items` row linking them. Then:

```ts
const { menuService } = await import("@/lib/services/menu.service");
// getPublishedWeek is cached — evict or use a fresh weekStart per run.
const week = await menuService.getPublishedWeek("tiffin");
expect(week).not.toBeNull();
const item = week!.items.find((i) => i.dishName === "TEST_DISH_A");
expect(item?.image).toMatchObject({ url: IMG.url });
expect(item?.dishPublicId).toBeTruthy();
```
Note: `getPublishedWeek` uses `publishedCache`. In `beforeEach`, evict it — import and call `evictPublishedCache` (in menu.service.ts) if exported; if not, export it or flush via the cache's API. Read the file to find the eviction helper.

- [ ] **Step 3: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/published-week-image.test.ts`
Expected: FAIL — `item.image`/`dishPublicId` undefined.

- [ ] **Step 4: Implement**

- Add to `PosterItem` (find its definition): `image?: FileDetail | null;` and `dishPublicId?: string;`. Import `FileDetail` from `@realm/storage/model` if not already imported.
- In `getPublishedWeek`, extend the inner select to `{ dayOfWeek, slot, position, dishName: dishes.name, diet: dishes.diet, image: dishes.image, dishPublicId: dishes.publicId }` and map each item to include `image: r.image ?? null, dishPublicId: r.dishPublicId`.
- Leave the `listWeeks` builder unchanged (optional fields default undefined).

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/published-week-image.test.ts`
Expected: PASS. Also run the existing menu service test to confirm no break: `pnpm exec vitest run lib/services/__tests__` (menu-related files).

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add lib/services/menu.service.ts lib/services/__tests__/published-week-image.test.ts
git commit -m "feat(menu): getPublishedWeek carries dish image + publicId"
```

---

### Task 2: `dishesService.listActiveWithImages()`

**Files:**
- Modify: `apps/tiffin-grab/lib/services/dishes.service.ts`
- Test: `apps/tiffin-grab/lib/services/__tests__/dishes-list-active.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CustomerDish = { publicId: string; name: string; description: string | null; diet: "veg" | "nonveg"; image: FileDetail; category: string | null };
  // on dishesService:
  async listActiveWithImages(): Promise<CustomerDish[]>;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/lib/services/__tests__/dishes-list-active.test.ts` (seed reference above). Seed three dishes: `TEST_DISH_A` (active, image IMG), `TEST_DISH_B` (active, image null), and a third inactive-with-image. Assert:

```ts
const { dishesService } = await import("@/lib/services/dishes.service");
const rows = await dishesService.listActiveWithImages();
const names = rows.map((r) => r.name);
expect(names).toContain("TEST_DISH_A");
expect(names).not.toContain("TEST_DISH_B");        // no image → excluded
expect(rows.every((r) => r.image != null)).toBe(true);
```
(Scope the wipe to the three test dish names.)

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/dishes-list-active.test.ts`
Expected: FAIL — `listActiveWithImages` is not a function.

- [ ] **Step 3: Implement**

In `lib/services/dishes.service.ts` add `import { and, eq, isNotNull, asc } from "drizzle-orm";` (merge with existing imports) and `import type { FileDetail } from "@realm/storage/model";`, then add the type + method:

```ts
export type CustomerDish = {
  publicId: string; name: string; description: string | null;
  diet: "veg" | "nonveg"; image: FileDetail; category: string | null;
};

// Customer-facing read: active dishes that actually have a photo, for the home
// dish gallery + meal-size slideshows. Text-only (imageless) dishes are excluded
// so the browse surfaces stay photo-driven.
async listActiveWithImages(): Promise<CustomerDish[]> {
  const rows = await db
    .select({ publicId: dishes.publicId, name: dishes.name, description: dishes.description, diet: dishes.diet, image: dishes.image, category: dishes.category })
    .from(dishes)
    .where(and(eq(dishes.active, true), isNotNull(dishes.image)))
    .orderBy(asc(dishes.name));
  return rows.map((r) => ({ ...r, image: r.image as FileDetail }));
}
```
Add this method to the `DishesService` class body (alongside create/update/delete).

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/dishes-list-active.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add lib/services/dishes.service.ts lib/services/__tests__/dishes-list-active.test.ts
git commit -m "feat(catalog): dishesService.listActiveWithImages read"
```

---

### Task 3: `<DishImage>` (photo or gradient fallback)

**Files:**
- Create: `apps/tiffin-grab/components/customer/home/dish-image.tsx`
- Test: `apps/tiffin-grab/components/customer/home/__tests__/dish-image.test.tsx`

**Interfaces:**
- Consumes: `hueFromKey` from `./plan-hero`, `FileDetail` from `@realm/storage/model`.
- Produces: `export function DishImage({ image, name, className }: { image: FileDetail | null; name: string; className?: string })`.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/components/customer/home/__tests__/dish-image.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DishImage } from "../dish-image";

afterEach(cleanup);

describe("DishImage", () => {
  it("renders an img with the photo url + alt when image present", () => {
    render(<DishImage image={{ url: "/api/files/paneer.jpg", filePath: "p", fileName: "p", type: "image/jpeg", size: 1 } as never} name="Paneer" />);
    const img = screen.getByRole("img", { name: "Paneer" });
    expect(img).toHaveAttribute("src", "/api/files/paneer.jpg");
  });

  it("renders a gradient fallback (no img) when image is null", () => {
    render(<DishImage image={null} name="Dal Fry" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Dal Fry", { exact: false })).toBeInTheDocument(); // fallback shows the name/glyph
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/dish-image.test.tsx`
Expected: FAIL — cannot resolve `../dish-image`.

- [ ] **Step 3: Implement**

Create `apps/tiffin-grab/components/customer/home/dish-image.tsx`:

```tsx
import type { FileDetail } from "@realm/storage/model";
import { cn } from "@realm/ui/cn";
import { hueFromKey } from "./plan-hero";

// Dish photo when present; otherwise a deterministic gradient tile (same hue trick
// as PlanHero) with the dish name, so imageless dishes still look intentional.
export function DishImage({ image, name, className }: { image: FileDetail | null; name: string; className?: string }) {
  if (image?.url) {
    // Plain <img>: dish photos come from /api/files (already sized/cached); next/image
    // would need remotePatterns config for the file route.
    return <img src={image.url} alt={name} loading="lazy" className={cn("h-full w-full object-cover", className)} />;
  }
  const hue = hueFromKey(name);
  return (
    <div
      className={cn("flex h-full w-full items-center justify-center p-2 text-center text-xs font-medium text-white/90", className)}
      style={{ backgroundImage: `linear-gradient(135deg, hsl(${hue} 65% 55%), hsl(${(hue + 40) % 360} 65% 45%))` }}
    >
      {name}
    </div>
  );
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/dish-image.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/home/dish-image.tsx components/customer/home/__tests__/dish-image.test.tsx
git commit -m "feat(customer): <DishImage> photo + gradient fallback"
```

---

### Task 4: `<DishModal>`

**Files:**
- Create: `apps/tiffin-grab/components/customer/home/dish-modal.tsx`
- Test: `apps/tiffin-grab/components/customer/home/__tests__/dish-modal.test.tsx`

**Interfaces:**
- Consumes: `DishImage` (Task 3), `CustomerDish` (Task 2), a dialog/drawer from `@realm/ui`.
- Produces: `export function DishModal({ dish, daysOnMenu, open, onOpenChange }: { dish: CustomerDish; daysOnMenu?: string[]; open: boolean; onOpenChange: (o: boolean) => void })`.

- [ ] **Step 1: Read** an existing customer dialog/drawer usage to mirror the responsive pattern + import path — e.g. the address dialog inside `app/(customer)/me/deliveries/delivery-calendar.tsx`, or `@realm/ui` `dialog`/`drawer` exports. Use whichever pattern the app already uses for customer modals.

- [ ] **Step 2: Write the failing test**

Create `apps/tiffin-grab/components/customer/home/__tests__/dish-modal.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DishModal } from "../dish-modal";

const dish = { publicId: "dsh_1", name: "Paneer Butter Masala", description: "Creamy tomato gravy", diet: "veg", image: { url: "/api/files/p.jpg", filePath: "p", fileName: "p", type: "image/jpeg", size: 1 }, category: "sabzi" } as never;

afterEach(cleanup);

describe("DishModal", () => {
  it("shows name, description, and days-on-menu when open", () => {
    render(<DishModal dish={dish} daysOnMenu={["Mon", "Thu"]} open onOpenChange={() => {}} />);
    expect(screen.getByText("Paneer Butter Masala")).toBeInTheDocument();
    expect(screen.getByText(/Creamy tomato gravy/)).toBeInTheDocument();
    expect(screen.getByText(/Mon/)).toBeInTheDocument();
    expect(screen.getByText(/Thu/)).toBeInTheDocument();
  });
});
```
(If the chosen dialog renders content only in a portal, ensure the test asserts against `screen` — Testing Library queries the portal by default.)

- [ ] **Step 3: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/dish-modal.test.tsx`
Expected: FAIL — cannot resolve `../dish-modal`.

- [ ] **Step 4: Implement**

Create `apps/tiffin-grab/components/customer/home/dish-modal.tsx` (`"use client"`). Use the app's dialog (from `@realm/ui` — the exact component/props confirmed in Step 1). Structure:

```tsx
"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@realm/ui/dialog"; // adjust to real export
import { DishImage } from "./dish-image";
import type { CustomerDish } from "@/lib/services/dishes.service";

export function DishModal({ dish, daysOnMenu, open, onOpenChange }: {
  dish: CustomerDish; daysOnMenu?: string[]; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="aspect-video overflow-hidden rounded-lg">
          <DishImage image={dish.image} name={dish.name} />
        </div>
        <DialogHeader><DialogTitle>{dish.name}</DialogTitle></DialogHeader>
        <p className="text-muted-foreground text-xs uppercase">{dish.diet === "veg" ? "Veg" : "Non-veg"}</p>
        {dish.description ? <p className="text-sm">{dish.description}</p> : null}
        {daysOnMenu?.length ? <p className="text-muted-foreground text-sm">On the menu: {daysOnMenu.join(", ")}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
```
Adjust the dialog import/prop names to the real `@realm/ui` API found in Step 1. Keep the content structure + the copy strings above.

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/dish-modal.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/home/dish-modal.tsx components/customer/home/__tests__/dish-modal.test.tsx
git commit -m "feat(customer): <DishModal> dish detail modal"
```

---

### Task 5: This-week menu section

**Files:**
- Create: `apps/tiffin-grab/components/customer/home/this-week-menu-section.tsx`
- Test: `apps/tiffin-grab/components/customer/home/__tests__/this-week-menu-section.test.tsx`

**Interfaces:**
- Consumes: the `getPublishedWeek` return shape (`{ planType, theme, weekStart, slots, items }`, items are `PosterItem` with `image`/`dishPublicId`), `DishImage` (Task 3), `DishModal` (Task 4), `Reveal`/`Pressable`/`LottieEmptyState` from `@/components/motion`.
- Produces: `export function ThisWeekMenuSection({ week }: { week: Awaited<ReturnType<typeof getPublishedWeek>> })` + `ThisWeekMenuSectionSkeleton`.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/components/customer/home/__tests__/this-week-menu-section.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, { Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }),
  Pressable: ({ children, ...p }: never) => <button {...(p as object)}>{children}</button>,
  LottieEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import { ThisWeekMenuSection } from "../this-week-menu-section";

const week = { planType: "tiffin", theme: { accent: "#f60", titlePrefix: "Tiffin" }, weekStart: "2026-07-13", slots: [], items: [
  { dayOfWeek: "mon", slot: "sabzi", position: 0, dishName: "Paneer", diet: "veg", image: null, dishPublicId: "dsh_1" },
] } as never;

afterEach(cleanup);

describe("ThisWeekMenuSection", () => {
  it("renders the week's dishes and opens the modal on tap", () => {
    render(<ThisWeekMenuSection week={week} />);
    expect(screen.getByText("Paneer")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Paneer"));
    // modal shows the dish name again (in a dialog title) — at least 2 nodes now
    expect(screen.getAllByText("Paneer").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the empty state when week is null", () => {
    render(<ThisWeekMenuSection week={null} />);
    expect(screen.getByText(/menu drops soon/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/this-week-menu-section.test.tsx`
Expected: FAIL — cannot resolve `../this-week-menu-section`.

- [ ] **Step 3: Implement**

Create `apps/tiffin-grab/components/customer/home/this-week-menu-section.tsx` (`"use client"`). Group `week.items` by `dayOfWeek` (order mon→sun), render each day as a labelled column/row of dish cards. Each card: `<Pressable>` wrapping `<DishImage image={item.image ?? null} name={item.dishName} />` + name + diet dot; clicking sets modal state. Build a `Map<dishPublicId, dayLabel[]>` from `week.items` and pass the matching `daysOnMenu` into `<DishModal>`. Since the card's item is a `PosterItem` (not a full `CustomerDish`), construct a minimal `CustomerDish` for the modal from the item: `{ publicId: item.dishPublicId ?? item.dishName, name: item.dishName, description: null, diet: item.diet, image: item.image ?? null, category: item.slot }` (description null — the poster select has no description; acceptable, the gallery modal carries descriptions). When `week` is null → `<LottieEmptyState animation="empty-box" title="This week's menu drops soon" body="Check back — fresh meals are on the way." />`. Wrap the section in a `SectionCard title="This week's menu"` (mirror how wallet-section uses `SectionCard`). Provide `ThisWeekMenuSectionSkeleton` (mirror another section's skeleton with `Skeleton` blocks).

Note: `DishModal.dish.image` type is `FileDetail` (non-null) in `CustomerDish`; widen the modal's `dish` to accept `image: FileDetail | null` OR build the minimal object with `image: item.image ?? null` and loosen `CustomerDish.image` to `FileDetail | null`. Prefer loosening `CustomerDish.image` to `FileDetail | null` in Task 2's type is NOT allowed (Task 2 filters non-null). Instead: give `DishModal` its own prop type `{ dish: { name; description; diet; image: FileDetail | null }; ... }` rather than requiring the full `CustomerDish`. Update Task 4's `DishModal` prop to that structural type so both the gallery (`CustomerDish`, image non-null — assignable) and this section (image nullable) can pass it. **When implementing Task 4, use the structural prop `{ name: string; description: string | null; diet: "veg"|"nonveg"; image: FileDetail | null }` for `dish`, not the full `CustomerDish`.**

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/this-week-menu-section.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/home/this-week-menu-section.tsx components/customer/home/__tests__/this-week-menu-section.test.tsx
git commit -m "feat(customer): this-week menu section with dish photos"
```

---

### Task 6: `<DishSlideshow>` + meal-sizes section

**Files:**
- Create: `apps/tiffin-grab/components/customer/home/dish-slideshow.tsx`
- Create: `apps/tiffin-grab/components/customer/home/meal-sizes-section.tsx`
- Test: `apps/tiffin-grab/components/customer/home/__tests__/meal-sizes-section.test.tsx`

**Interfaces:**
- Consumes: `ClientMealSizeView` from `@/lib/catalog/types` (fields `name, planKey, tier, components[], items[], kcalMin, kcalMax, proteinG, basePrice`), `CustomerDish` (Task 2), `DishImage` (Task 3), `Reveal` from `@/components/motion`, `useReducedMotion` from `motion/react`.
- Produces: `DishSlideshow({ dishes }: { dishes: CustomerDish[] })` and `MealSizesSection({ mealSizes, dishPool }: { mealSizes: ClientMealSizeView[]; dishPool: CustomerDish[] })` + `MealSizesSectionSkeleton`.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/components/customer/home/__tests__/meal-sizes-section.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({ useReducedMotion: () => true }));
vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, { Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }),
}));

import { MealSizesSection } from "../meal-sizes-section";

const mealSizes = [{ publicId: "ms_1", name: "Medium", planKey: "veg-tiffin", tier: "medium", components: ["Sabzi", "Dal", "Rice"], items: [], kcalMin: 600, kcalMax: 700, proteinG: 32, carbsG: null, fatG: null, basePrice: 8.5, trial: false }] as never;
const dishPool = [{ publicId: "dsh_1", name: "Paneer", description: null, diet: "veg", image: { url: "/api/files/p.jpg", filePath: "p", fileName: "p", type: "image/jpeg", size: 1 }, category: "sabzi" }] as never;

afterEach(cleanup);

describe("MealSizesSection", () => {
  it("renders tier, components, macros, price", () => {
    render(<MealSizesSection mealSizes={mealSizes} dishPool={dishPool} />);
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText(/Sabzi/)).toBeInTheDocument();
    expect(screen.getByText(/32/)).toBeInTheDocument();     // protein
    expect(screen.getByText(/8\.50/)).toBeInTheDocument();  // price
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/meal-sizes-section.test.tsx`
Expected: FAIL — cannot resolve `../meal-sizes-section`.

- [ ] **Step 3: Implement `<DishSlideshow>`**

Create `apps/tiffin-grab/components/customer/home/dish-slideshow.tsx` (`"use client"`): takes up to ~5 dishes from the pool, shows one `<DishImage>` at a time, auto-advances on an interval (e.g. 3s) via `useEffect`+`setInterval`, crossfades via `motion` opacity; `useReducedMotion()` true → render only the first image, no interval. Guard empty pool (render nothing or a single fallback tile).

Note: the interval must be cleared on unmount; do not use `Date.now()` for keys (use index).

- [ ] **Step 4: Implement `MealSizesSection`**

Create `apps/tiffin-grab/components/customer/home/meal-sizes-section.tsx` (`"use client"`). Wrap in `SectionCard title="Meal sizes"`. Group `mealSizes` by `planKey`; per meal size render a card: top `<DishSlideshow dishes={dishPool.slice(0, 5)} />` (shared pool; a later refinement could filter by plan), then body: `tier` + plan label, `components.join(" · ")`, `~${kcalMin}–${kcalMax} kcal`, `${proteinG}g protein` (guard nulls), `$${basePrice.toFixed(2)} / meal`. Card expands (collapsible) to the full `items` list (name + qty + weight). `Reveal.Group` staggers the cards. Provide `MealSizesSectionSkeleton`.

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/meal-sizes-section.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/home/dish-slideshow.tsx components/customer/home/meal-sizes-section.tsx components/customer/home/__tests__/meal-sizes-section.test.tsx
git commit -m "feat(customer): meal-sizes section + dish slideshow"
```

---

### Task 7: Dishes gallery section

**Files:**
- Create: `apps/tiffin-grab/components/customer/home/dishes-section.tsx`
- Test: `apps/tiffin-grab/components/customer/home/__tests__/dishes-section.test.tsx`

**Interfaces:**
- Consumes: `CustomerDish` (Task 2), `DishImage` (Task 3), `DishModal` (Task 4), `Reveal`/`Pressable`/`LottieEmptyState` from `@/components/motion`.
- Produces: `DishesSection({ dishes, daysByDish }: { dishes: CustomerDish[]; daysByDish?: Record<string, string[]> })` + `DishesSectionSkeleton`.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/components/customer/home/__tests__/dishes-section.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, { Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }),
  Pressable: ({ children, ...p }: never) => <button {...(p as object)}>{children}</button>,
  LottieEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import { DishesSection } from "../dishes-section";

const dishes = [{ publicId: "dsh_1", name: "Paneer", description: "Creamy", diet: "veg", image: { url: "/api/files/p.jpg", filePath: "p", fileName: "p", type: "image/jpeg", size: 1 }, category: "sabzi" }] as never;

afterEach(cleanup);

describe("DishesSection", () => {
  it("renders dish cards and opens the modal", () => {
    render(<DishesSection dishes={dishes} />);
    fireEvent.click(screen.getByText("Paneer"));
    expect(screen.getByText(/Creamy/)).toBeInTheDocument(); // modal description
  });
  it("empty state when no dishes", () => {
    render(<DishesSection dishes={[]} />);
    expect(screen.getByText(/no dishes/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/dishes-section.test.tsx`
Expected: FAIL — cannot resolve `../dishes-section`.

- [ ] **Step 3: Implement**

Create `apps/tiffin-grab/components/customer/home/dishes-section.tsx` (`"use client"`). `SectionCard title="Dishes"`. Photo grid of `<Pressable>` cards, each `<DishImage image={d.image} name={d.name} />` + name + diet dot; click opens `<DishModal dish={selected} daysOnMenu={daysByDish?.[selected.publicId]} .../>`. Empty (`dishes.length === 0`) → `<LottieEmptyState animation="empty-box" title="No dishes to show yet" />`. `Reveal.Group` stagger. Provide `DishesSectionSkeleton`.

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/dishes-section.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/home/dishes-section.tsx components/customer/home/__tests__/dishes-section.test.tsx
git commit -m "feat(customer): dishes gallery section"
```

---

### Task 8: Wire the three sections into the home

**Files:**
- Modify: `apps/tiffin-grab/app/(customer)/me/home-sections.ts`
- Modify: `apps/tiffin-grab/app/(customer)/me/page.tsx`
- Test: `apps/tiffin-grab/app/(customer)/me/__tests__/home-sections-order.test.ts`

**Interfaces:**
- Consumes: all Task 1–7 exports.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/app/(customer)/me/__tests__/home-sections-order.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HOME_SECTIONS } from "../home-sections";

describe("HOME_SECTIONS", () => {
  it("orders this-week-menu, meal-sizes, dishes right after subscription", () => {
    const keys = HOME_SECTIONS.map((s) => s.key);
    expect(keys).toEqual(["subscription", "menu", "mealSizes", "dishes", "browse", "coupons", "wallet", "analytics"]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run "app/(customer)/me/__tests__/home-sections-order.test.ts"`
Expected: FAIL — new keys absent.

- [ ] **Step 3: Implement `home-sections.ts`**

Update the `HomeSectionKey` union + `HOME_SECTIONS` array:

```ts
export type HomeSectionKey = "subscription" | "menu" | "mealSizes" | "dishes" | "browse" | "coupons" | "wallet" | "analytics";

export const HOME_SECTIONS: readonly { key: HomeSectionKey; title: string }[] = [
  { key: "subscription", title: "Your subscription" },
  { key: "menu", title: "This week's menu" },
  { key: "mealSizes", title: "Meal sizes" },
  { key: "dishes", title: "Dishes" },
  { key: "browse", title: "Browse plans" },
  { key: "coupons", title: "Available coupons" },
  { key: "wallet", title: "Wallet" },
  { key: "analytics", title: "Your activity" },
];
```

- [ ] **Step 4: Implement `page.tsx` loaders + islands**

Add imports for the new sections + `getPublishedWeek` (`@/lib/services/menu.service`), `dishesService` (`@/lib/services/dishes.service`). Add three branches to the `HOME_SECTIONS.map` key-switch (mirroring the existing ternary chain) for `"menu"`, `"mealSizes"`, `"dishes"`, each rendering a `<Suspense fallback={<XSkeleton/>}>` around a new async Data component. Add the Data components:

```tsx
async function MenuSectionData({ userId }: { userId: bigint }) {
  const subs = await myActiveSubscriptions(userId);
  const planType = (subs[0]?.planType as "tiffin" | "healthy" | undefined) ?? "tiffin";
  const week = await getPublishedWeek(planType);
  return <ThisWeekMenuSection week={week} />;
}

async function MealSizesSectionData() {
  const [catalog, dishPool] = await Promise.all([toClientCatalog(await loadCatalogSnapshot()), dishesService.listActiveWithImages()]);
  return <MealSizesSection mealSizes={catalog.mealSizes} dishPool={dishPool} />;
}

async function DishesSectionData() {
  const dishes = await dishesService.listActiveWithImages();
  return <DishesSection dishes={dishes} />;
}
```
Note: `loadCatalogSnapshot()`/`getPublishedWeek()`/`listActiveWithImages()` are cached, so calling them in separate islands does not double-hit the DB. `myActiveSubscriptions` is already called by the subscription island — an extra call here is cache-free but cheap; acceptable (keeps islands independent). Keep the subscription/browse/coupons/wallet/analytics branches unchanged.

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run "app/(customer)/me/__tests__/home-sections-order.test.ts"`
Expected: PASS.

- [ ] **Step 6: Full verify gate**

Run: `cd /Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4 && pnpm turbo typecheck && pnpm turbo test`
Expected: new + motion suites pass; note any PRE-EXISTING unrelated failures (same set observed in Slices 0/4 — login-form/phone/app-settings/RabbitMQ/flaky live-DB) but your touched files pass.

- [ ] **Step 7: Manual browser check**

Start the app (`/run` or `pnpm --filter tiffin-grab dev`), log in as a `user`. Confirm the home shows, in order: subscription, this-week menu (dish photos or gradient fallbacks), meal sizes (spec + slideshow), dishes gallery (tap → modal), then the existing sections. If the seed DB has no dish images, everything shows gradient fallbacks — flag to the user (data, not a bug).

- [ ] **Step 8: Commit**

```bash
git add "app/(customer)/me/home-sections.ts" "app/(customer)/me/page.tsx" "app/(customer)/me/__tests__/home-sections-order.test.ts"
git commit -m "feat(customer): wire this-week menu, meal sizes, dishes into home"
```

---

## Self-Review

**Spec coverage:**
- This-week menu wired + dish photos → Task 1 (image in read) + Task 5 (section) + Task 8 (loader). ✓
- Meal sizes = spec cards + dish-photo slideshow → Task 6. ✓
- Dishes gallery → Task 2 (read) + Task 7 (section). ✓
- Shared dish modal (photo/desc/diet/days) → Task 4; days-on-menu derived in Task 5. ✓
- Image + gradient fallback → Task 3. ✓
- Section order (menu hero above meal-sizes/dishes) → Task 8. ✓
- Motion reuse (Reveal/Pressable/LottieEmptyState/slideshow) → Tasks 5/6/7. ✓
- No schema change / no new routes → held (read extension + new read only). ✓

**Placeholder scan:** Task 4's dialog import (`@realm/ui/dialog`) is marked "adjust to the real export confirmed in Step 1" — this is a real read-then-match instruction (the app's exact dialog API isn't visible from the plan), with the full content structure + copy provided. Not a vague placeholder. Live-DB tests (Tasks 1, 2) use concrete direct-insert seeds from the seed reference. All component tests + implementation code are complete.

**Type consistency:** `CustomerDish` (Task 2) is consumed in Tasks 3/6/7 identically. `DishModal`'s `dish` prop is a **structural type** `{ name; description; diet; image: FileDetail | null }` (Task 4 note + Task 5 note) so both the gallery (`CustomerDish`, non-null image) and the this-week section (nullable image) pass it — resolved explicitly to avoid a non-null/nullable mismatch. `PosterItem.image?`/`dishPublicId?` (Task 1) are consumed in Task 5. `HomeSectionKey` union (Task 8) matches the three new section components. `ClientMealSizeView` fields (Task 6) match `lib/catalog/types.ts`.

**Note on live-DB availability:** Tasks 1, 2 require the local Postgres (confirmed reachable in Slice 4). If down at run time, the implementer flags it rather than skipping assertions.
