# Customer Self-Serve Subscribe (Slice 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the customer self-serve subscribe flow (add start-date selection, make the slot picker plan-type aware, fix stale pricing UI/copy) and revamp the catalog admin to typed, user-friendly controls, removing settings the per-tiffin model retired.

**Architecture:** Add framework-agnostic weekday helpers to `@tiffin/commons` (TD-1). Add `orders.startDate` + `plans.allowedStartDays`, validate start dates server-side in `createOrder` (mirroring `validateOrderSlots`), and thread `startDate` through the existing wizard→checkout→order plumbing. The wizard's Duration step gains the date input and the Schedule step becomes plan-type aware. The config-driven catalog editor gains `multiselect`/`date` field types with friendly labels + units, dynamic options for references, and drops the unused `addons` resource and deprecated discount fields.

**Tech Stack:** Next.js 16 (MODIFIED — read `node_modules/next/dist/docs/` before framework code), Drizzle ORM + drizzle-kit, Postgres, Vitest, pnpm. Design-system in `apps/web/components/ds/`, primitives in `apps/web/components/ui/`.

## Global Constraints

- App commands run from `apps/web/`. `@tiffin/commons` package commands run from `packages/commons/`.
- drizzle-kit / tsx / vitest do NOT load `.env.local` — prefix app DB commands with `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin"`.
- Tests share + wipe the dev DB; after a test run reseed: `pnpm db:seed && pnpm db:seed:catalog && pnpm db:seed:menu && pnpm db:seed:admin` (each DB-prefixed).
- Vitest can't eval NextAuth: a test importing a session service must `vi.mock("@/lib/auth", () => ({ auth: async () => null }))` then `await import(...)`.
- Dual-id (internal bigint + public_id nanoid), epoch-ms timestamps. New shared code → `commons` packages (TD-1). Admin controls typed, never free-text for known values (TD-3).
- Commit messages plain, NO `Co-Authored-By`.
- Per-task: each task ends green (`pnpm typecheck` + relevant tests); the final gate (Task 5) runs `pnpm test && pnpm typecheck && pnpm build`.
- Branch `crm/slice-2-self-serve-subscribe` (already created).

**Weekday key convention:** weekday keys are the lowercase 3-letter forms `"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"` (same as `db/schema/menu.ts`'s `dayOfWeek` enum). Friendly labels: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.

---

### Task 1: Weekday date helpers in `@tiffin/commons` (TD-1)

**Files:**
- Create: `packages/commons/src/util/dates.ts`
- Create: `packages/commons/src/util/dates.test.ts`
- Modify: `packages/commons/src/index.ts`

**Interfaces:**
- Produces: `type Weekday = "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"`
- Produces: `weekdayKey(d: Date): Weekday` — UTC weekday key of a date.
- Produces: `isWeekend(d: Date): boolean`
- Produces: `nextWeekday(from: Date): Date` — the next UTC calendar day strictly after `from` that is Mon–Fri (returns a date at UTC midnight).
- Produces: `parseIsoDateUtc(iso: string): Date` — parse `YYYY-MM-DD` to a UTC-midnight Date; throws on malformed input.

- [ ] **Step 1: Write the failing test**

Create `packages/commons/src/util/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isWeekend, nextWeekday, parseIsoDateUtc, weekdayKey } from "./dates";

const d = (iso: string) => parseIsoDateUtc(iso);

describe("weekdayKey", () => {
  it("maps known dates to weekday keys", () => {
    expect(weekdayKey(d("2026-06-22"))).toBe("mon"); // a Monday
    expect(weekdayKey(d("2026-06-26"))).toBe("fri");
    expect(weekdayKey(d("2026-06-27"))).toBe("sat");
    expect(weekdayKey(d("2026-06-28"))).toBe("sun");
  });
});

describe("isWeekend", () => {
  it("is true for Sat/Sun only", () => {
    expect(isWeekend(d("2026-06-27"))).toBe(true);
    expect(isWeekend(d("2026-06-28"))).toBe(true);
    expect(isWeekend(d("2026-06-26"))).toBe(false);
  });
});

describe("nextWeekday", () => {
  it("returns the next day when that day is a weekday", () => {
    expect(weekdayKey(nextWeekday(d("2026-06-22")))).toBe("tue"); // Mon -> Tue
  });
  it("skips the weekend from Friday", () => {
    const r = nextWeekday(d("2026-06-26")); // Fri -> Mon
    expect(weekdayKey(r)).toBe("mon");
    expect(r.getUTCDate()).toBe(29);
  });
  it("skips the weekend from Saturday and Sunday", () => {
    expect(weekdayKey(nextWeekday(d("2026-06-27")))).toBe("mon");
    expect(weekdayKey(nextWeekday(d("2026-06-28")))).toBe("mon");
  });
});

describe("parseIsoDateUtc", () => {
  it("throws on malformed input", () => {
    expect(() => parseIsoDateUtc("2026/06/22")).toThrow();
    expect(() => parseIsoDateUtc("nope")).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/commons/`): `pnpm test src/util/dates.test.ts`
Expected: FAIL — `Cannot find module './dates'`.

- [ ] **Step 3: Implement the helpers**

Create `packages/commons/src/util/dates.ts`:

```ts
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

// Index by JS getUTCDay(): 0 = Sunday .. 6 = Saturday.
const BY_INDEX: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function weekdayKey(d: Date): Weekday {
  return BY_INDEX[d.getUTCDay()];
}

export function isWeekend(d: Date): boolean {
  const k = weekdayKey(d);
  return k === "sat" || k === "sun";
}

// Next UTC calendar day strictly after `from` that is a weekday (Mon–Fri),
// normalized to UTC midnight.
export function nextWeekday(from: Date): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (isWeekend(d));
  return d;
}

// Parse a strict `YYYY-MM-DD` string to a UTC-midnight Date.
export function parseIsoDateUtc(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  const [, y, mo, da] = m;
  const d = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da)));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ISO date: ${iso}`);
  return d;
}
```

- [ ] **Step 4: Export from the barrel**

In `packages/commons/src/index.ts`, add:

```ts
export * from "./util/dates";
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `packages/commons/`): `pnpm test src/util/dates.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/commons/src/util/dates.ts packages/commons/src/util/dates.test.ts packages/commons/src/index.ts
git commit -m "feat(commons): add weekday date helpers (weekdayKey, nextWeekday, isWeekend, parseIsoDateUtc)"
```

---

### Task 2: Start-date data path — schema, validation, order wiring

**Files:**
- Modify: `apps/web/db/schema/orders.ts` (add `startDate`)
- Modify: `apps/web/db/schema/catalog.ts` (add `plans.allowedStartDays`)
- Modify: `apps/web/lib/catalog/types.ts` (snapshot plan fields)
- Modify: `apps/web/lib/catalog/load.ts` (load `allowedStartDays`)
- Modify: `apps/web/lib/pricing/types.ts` (`PricingSelections.startDate`)
- Create: `apps/web/lib/services/start-date.ts` (`validateStartDate`)
- Create: `apps/web/lib/services/__tests__/start-date.test.ts`
- Modify: `apps/web/lib/services/orders.service.ts` (validate + write `startDate`)
- Modify: `apps/web/components/wizard/selections.ts` (`initialSelections.startDate`)
- Modify: `apps/web/db/seed-catalog.ts` (`allowedStartDays` on seeded plans)
- Modify fixtures: `apps/web/lib/pricing/engine.test.ts`, `apps/web/lib/pricing/build-catalog.test.ts` (add `startDate` to selection fixtures)

**Interfaces:**
- Consumes: `weekdayKey`, `nextWeekday`, `parseIsoDateUtc`, `isWeekend` from `@tiffin/commons` (Task 1).
- Produces: `validateStartDate(startDate: string, allowedStartDays: string[], today: Date): void` — throws `ValidationError` on past/too-soon, weekend, or not-allowed weekday.
- Produces: `PricingSelections.startDate: string` (ISO `YYYY-MM-DD`); `CatalogSnapshot.plans[].allowedStartDays: string[]` (+ client snapshot).

- [ ] **Step 1: Write the failing validator test**

Create `apps/web/lib/services/__tests__/start-date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateStartDate } from "../start-date";

const ALL = ["mon", "tue", "wed", "thu", "fri"];
// Fixed "today" = Monday 2026-06-22 for deterministic boundaries.
const today = new Date(Date.UTC(2026, 5, 22));

describe("validateStartDate", () => {
  it("accepts the next weekday after today", () => {
    expect(() => validateStartDate("2026-06-23", ALL, today)).not.toThrow(); // Tue
  });
  it("rejects a date before the next weekday (today or earlier)", () => {
    expect(() => validateStartDate("2026-06-22", ALL, today)).toThrow(); // today
    expect(() => validateStartDate("2026-06-19", ALL, today)).toThrow(); // past
  });
  it("rejects Saturday and Sunday", () => {
    expect(() => validateStartDate("2026-06-27", ALL, today)).toThrow(); // Sat
    expect(() => validateStartDate("2026-06-28", ALL, today)).toThrow(); // Sun
  });
  it("rejects a weekday not in allowedStartDays", () => {
    expect(() => validateStartDate("2026-06-23", ["mon", "wed", "fri"], today)).toThrow(); // Tue not allowed
  });
  it("accepts a later allowed weekday", () => {
    expect(() => validateStartDate("2026-06-24", ["mon", "wed", "fri"], today)).not.toThrow(); // Wed
  });
  it("rejects a malformed date string", () => {
    expect(() => validateStartDate("2026/06/23", ALL, today)).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/start-date.test.ts`
Expected: FAIL — `Cannot find module '../start-date'`.

- [ ] **Step 3: Implement the validator**

Create `apps/web/lib/services/start-date.ts`:

```ts
import { isWeekend, parseIsoDateUtc, weekdayKey, nextWeekday, ValidationError } from "@tiffin/commons";

// Validate a customer-chosen subscription start date.
// - must be on/after the next weekday after `today` (no past, no same-day, skip weekends)
// - must not be Saturday/Sunday
// - its weekday must be in the plan's allowedStartDays
export function validateStartDate(startDate: string, allowedStartDays: string[], today: Date): void {
  const start = parseIsoDateUtc(startDate); // throws on malformed
  const earliest = nextWeekday(today);
  if (start.getTime() < earliest.getTime()) {
    throw new ValidationError("Start date must be on or after the next available weekday");
  }
  if (isWeekend(start)) {
    throw new ValidationError("Start date cannot be a weekend");
  }
  const wk = weekdayKey(start);
  if (!allowedStartDays.includes(wk)) {
    throw new ValidationError("This plan cannot start on the selected day");
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/start-date.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the schema columns**

In `apps/web/db/schema/orders.ts`, add after `durationWeeks` (`date` is exported by `drizzle-orm/pg-core` — add it to the existing import from that module):

```ts
  startDate: date("start_date").notNull(),
```

In `apps/web/db/schema/catalog.ts`, add to the `plans` table definition:

```ts
  allowedStartDays: text("allowed_start_days").array().notNull().default(["mon", "tue", "wed", "thu", "fri"]),
```

- [ ] **Step 6: Carry `allowedStartDays` through the snapshot**

In `apps/web/lib/catalog/types.ts`:
- Server `CatalogSnapshot.plans` element: add `allowedStartDays: string[]`.
- `ClientCatalogSnapshot.plans` element: add `allowedStartDays: string[]`.

In `apps/web/lib/catalog/load.ts`, in the plan row mapping add `allowedStartDays: p.allowedStartDays`.

- [ ] **Step 7: Add `startDate` to `PricingSelections` + fixtures**

In `apps/web/lib/pricing/types.ts`, add to `PricingSelections`:

```ts
  startDate: string; // ISO YYYY-MM-DD; not used by pricing, carried for order creation
```

In `apps/web/lib/pricing/engine.test.ts` and `apps/web/lib/pricing/build-catalog.test.ts`, add `startDate: "2026-06-23"` to the `sel()`/selection fixtures so they satisfy the type. (Pricing ignores it; the value is irrelevant to assertions.)

- [ ] **Step 8: Wire validation + write into `createOrder`**

In `apps/web/lib/services/orders.service.ts`:
- Import: `import { validateStartDate } from "./start-date";`
- After the existing `validateOrderSlots(...)` call, add:
```ts
  validateStartDate(input.selections.startDate, plan.allowedStartDays, new Date());
```
- In the `orders` insert `.values({...})`, add:
```ts
        startDate: input.selections.startDate,
```

- [ ] **Step 9: Default `startDate` in wizard selections + seed allowedStartDays**

In `apps/web/components/wizard/selections.ts`, add `startDate: ""` to `initialSelections` (the Duration-step UI in Task 3 sets the real value; `""` keeps the type satisfied and is rejected by `validateStartDate` until chosen).

In `apps/web/db/seed-catalog.ts`, add `allowedStartDays: ["mon", "tue", "wed", "thu", "fri"]` to each entry in `PLANS` (all four). The existing `onConflictDoUpdate` set clause should also sync it — add `allowedStartDays: p.allowedStartDays` to that `set`.

- [ ] **Step 10: Migrate, reseed, typecheck, run affected tests**

Run:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:generate
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:catalog
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm typecheck
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/start-date.test.ts lib/services/__tests__/orders.service.test.ts lib/pricing/
```
Expected: migration applied (`orders.start_date`, `plans.allowed_start_days`); typecheck clean; tests pass. The `orders.service` test creates orders — update its selection fixture to include `startDate` (a valid next-weekday date relative to `new Date()`). To keep that test deterministic and valid regardless of when it runs, compute the date in the test: `import { nextWeekday } from "@tiffin/commons"` and set `startDate` to the ISO of `nextWeekday(new Date())` (format `YYYY-MM-DD` via `toISOString().slice(0,10)`).

- [ ] **Step 11: Commit**

```bash
git add apps/web/db/schema/orders.ts apps/web/db/schema/catalog.ts apps/web/lib/catalog/types.ts apps/web/lib/catalog/load.ts apps/web/lib/pricing/types.ts apps/web/lib/pricing/engine.test.ts apps/web/lib/pricing/build-catalog.test.ts apps/web/lib/services/start-date.ts apps/web/lib/services/__tests__/start-date.test.ts apps/web/lib/services/orders.service.ts apps/web/lib/services/__tests__/orders.service.test.ts apps/web/components/wizard/selections.ts apps/web/db/seed-catalog.ts apps/web/db/migrations
git commit -m "feat(subscribe): add start date to orders + plan allowedStartDays with server validation"
```

---

### Task 3: Wizard UI — start date, plan-type slots, transparency, copy

**Files:**
- Modify: `apps/web/components/wizard/steps/step-duration.tsx` (start date input; drop discount label)
- Modify: `apps/web/components/wizard/steps/step-schedule.tsx` (plan-type slot picker)
- Modify: `apps/web/components/wizard/steps/step-baseline.tsx` (reset mealSlots on plan change)
- Modify: `apps/web/components/wizard/wizard.tsx` (step label "Start & duration"; gate deploy on startDate; button copy)
- Modify: `apps/web/components/wizard/invoice.tsx` (volume-tier nudge)

**Interfaces:**
- Consumes: `WizardSelections.startDate`, `ClientCatalogSnapshot.plans[].{planType,offeredSlots,allowedStartDays}`, `PricingResult.tier`.

- [ ] **Step 1: Plan-type aware slot picker in `step-schedule.tsx`**

Replace the meal-slots block so it derives the selected plan and restricts slots. Add near the top of the component body:

```tsx
  const plan = catalog.plans.find((p) => p.key === selections.planKey);
  const offered = new Set(plan?.offeredSlots ?? []);
  const slotsForPlan = enabledSlots.filter((s) => offered.has(s.key));
  const isTiffin = plan?.planType === "tiffin";
```

Replace the existing `{enabledSlots.length > 0 && (...)}` meal-slots section with one that uses `slotsForPlan` and renders a single-select for tiffin plans:

```tsx
      {slotsForPlan.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Meal slots</Label>
          {isTiffin ? (
            <RadioGroup
              className="grid gap-2"
              value={selections.mealSlots[0] ?? ""}
              onValueChange={(v) => set({ mealSlots: [v] })}
            >
              {slotsForPlan.map((slot) => (
                <div key={slot.key} className="flex items-center gap-2 rounded-md border p-3">
                  <RadioGroupItem id={`slot-${slot.key}`} value={slot.key} />
                  <Label htmlFor={`slot-${slot.key}`}>{slot.label}</Label>
                </div>
              ))}
            </RadioGroup>
          ) : (
            slotsForPlan.map((slot) => (
              <label key={slot.key} className="flex items-center gap-2 rounded-md border p-3">
                <input
                  type="checkbox"
                  checked={selections.mealSlots.includes(slot.key)}
                  onChange={(e) => toggleSlot(slot.key, e.target.checked)}
                />
                <span>{slot.label}</span>
              </label>
            ))
          )}
        </div>
      )}
```

(`RadioGroup`/`RadioGroupItem` are already imported in this file from `@/components/ui/radio-group`. Keep the existing `toggleSlot` for the multi-select branch.)

- [ ] **Step 2: Reset mealSlots when the plan changes in `step-baseline.tsx`**

The plan card `onClick` currently does `set({ planKey: ..., mealSizeId: "" })`. Change it to also reset `mealSlots` to the plan's sensible default:

```tsx
          onClick={() => {
            const offered = p.offeredSlots ?? [];
            const defaultSlots = p.planType === "tiffin" ? offered.slice(0, 1) : offered;
            set({ planKey: p.key as WizardSelections["planKey"], mealSizeId: "", mealSlots: defaultSlots });
          }}
```

- [ ] **Step 3: Start-date input + drop discount label in `step-duration.tsx`**

Add the start-date field above the weeks selector, and remove the `(${d.discountPct}%)` suffix. The date input's `min` is the next weekday after today and weekend/disallowed days are validated on change. Add imports + helper at the top of the file:

```tsx
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@tiffin/commons";
import { Input } from "@/components/ui/input";
```

Inside the component, compute constraints from the selected plan:

```tsx
  const plan = catalog.plans.find((p) => p.key === selections.planKey);
  const allowed = plan?.allowedStartDays ?? ["mon", "tue", "wed", "thu", "fri"];
  const minDate = nextWeekday(new Date()).toISOString().slice(0, 10);
  const dayLabel: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  const onStartDate = (v: string) => {
    if (!v) { set({ startDate: "" }); return; }
    try {
      const wk = weekdayKey(parseIsoDateUtc(v));
      if (allowed.includes(wk)) set({ startDate: v });
    } catch { /* ignore malformed intermediate input */ }
  };
```

Add this block as the first child of the outer `<div className="space-y-6">`, before the "Commitment duration" block:

```tsx
      <div>
        <Label className="text-sm font-medium">Start date</Label>
        <Input
          type="date"
          className="mt-2 w-fit"
          min={minDate}
          value={selections.startDate}
          onChange={(e) => onStartDate(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Deliveries start on a weekday ({allowed.map((d) => dayLabel[d] ?? d).join(", ")}); earliest {minDate}.
        </p>
      </div>
```

Change the weeks label to drop the discount suffix:

```tsx
              <Label htmlFor={`d${d.weeks}`}>{d.weeks}wk</Label>
```

- [ ] **Step 4: Step label, deploy gate, and button copy in `wizard.tsx`**

- Rename the step in `STEPS`: change `"Duration"` to `"Start & duration"`.
- Gate the final action on a chosen start date: change the final button's `disabled` from `!selections.mealSizeId` to `!selections.mealSizeId || !selections.startDate`.
- Change the final button label from `"Deploy Plan Formulation"` to `"Continue to checkout"`.

- [ ] **Step 5: Volume-tier nudge in `invoice.tsx`**

Below the per-tiffin line and above/near the total, add a nudge shown only when the matched tier has uplift (i.e. not the best 0% band):

```tsx
      {result.tier.upliftPct > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          Order 20+ tiffins for the best per-tiffin rate (currently +{result.tier.upliftPct}%).
        </p>
      )}
```

(`result.tier` is `{ minQty, maxQty, upliftPct }`. The "20+" copy matches the seeded top band; if the seed changes, this is cosmetic.)

- [ ] **Step 6: Verify (typecheck + build + manual reasoning)**

Run:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm typecheck
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build
```
Expected: both clean. (These are UI components without dedicated unit tests; the slot/plan logic is covered server-side by `validateOrderSlots`/`validateStartDate`. Build + typecheck are the gate.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/wizard/steps/step-duration.tsx apps/web/components/wizard/steps/step-schedule.tsx apps/web/components/wizard/steps/step-baseline.tsx apps/web/components/wizard/wizard.tsx apps/web/components/wizard/invoice.tsx
git commit -m "feat(subscribe): start-date picker, plan-type slot selection, volume nudge, copy polish"
```

---

### Task 4: Catalog editor — typed, user-friendly controls (TD-3)

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/resource-config.ts` (FieldType + label maps + units + plans fields)
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx` (render multiselect/date + friendly labels + units)
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx` (resolve dynamic options)

**Interfaces:**
- Consumes: `mealSlotsService.enabledSlots()` (returns `{ key, label, sortOrder }[]`).
- Produces: `FieldType` extended with `"multiselect" | "date"`; `FieldDef` gains optional `optionsSource?: "mealSlots" | "weekdays"`, `unit?: string`, and `optionLabels?: Record<string,string>`; `ResourceEditor` accepts a `dynamicOptions: Record<string, { value: string; label: string }[]>` prop.

- [ ] **Step 1: Extend the field config**

In `apps/web/app/(dashboard)/dashboard/catalog/resource-config.ts`:

Extend the type definitions:

```ts
export type FieldType = "text" | "number" | "csv" | "select" | "multiselect" | "date";
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  optionsSource?: "mealSlots" | "weekdays";
  optionLabels?: Record<string, string>;
  unit?: string;
  optional?: boolean;
}
```

Add shared label maps near the top:

```ts
export const WEEKDAY_OPTIONS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};
const ENUM_LABELS: Record<string, string> = {
  tiffin: "Tiffin", healthy: "Healthy", budget: "Budget", medium: "Medium", premium: "Premium",
  veg: "Veg", nonveg: "Non-veg", both: "Both",
};
```

Update the `plans` resource fields: make `offeredSlots` a multiselect from `mealSlots`, give `planType`/`tier`/`diet` friendly labels, and add `allowedStartDays`:

```ts
  plans: {
    key: "plans",
    label: "Plans",
    fields: [
      { key: "key", label: "Key", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "description", label: "Description", type: "text", optional: true },
      { key: "planType", label: "Plan type", type: "select", options: ["tiffin", "healthy"], optionLabels: ENUM_LABELS },
      { key: "offeredSlots", label: "Offered slots", type: "multiselect", optionsSource: "mealSlots" },
      { key: "allowedStartDays", label: "Allowed start days", type: "multiselect", optionsSource: "weekdays", optionLabels: WEEKDAY_LABELS },
    ],
  },
```

Apply friendly labels + units to the other resources (only the changed fields shown; keep the rest):
- `meal-sizes`: `tier`/`diet` selects gain `optionLabels: ENUM_LABELS`; add `unit: "$"` to `basePrice`, `unit: "kcal"` to `kcalMin`/`kcalMax`, `unit: "g"` to `proteinG`/`carbsG`/`fatG`.
- `addons`: (removed in Task 5 — leave as-is here).
- `delivery-frequencies`: remove the `courierDiscountPct` field entirely (deprecated).
- `duration-packages`: remove the `discountPct` field entirely (deprecated).
- `delivery-zones`: unchanged.

Update `fieldsToPatch`/`rowToFields` to handle `multiselect` (same as `csv`: array ↔ comma string internally) and `date` (treated as text). In `fieldsToPatch`, add `multiselect` to the array branch alongside `csv`:

```ts
    if (f.type === "csv" || f.type === "multiselect") {
      patch[f.key] = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    } else if (f.type === "number") {
```

In `rowToFields`, the existing `csv` branch already joins arrays; extend the condition to include `multiselect`:

```ts
    out[f.key] = (f.type === "csv" || f.type === "multiselect") && Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
```

- [ ] **Step 2: Resolve dynamic options in the page**

In `apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx`:
- Import the slots service + the weekday constants: `import { mealSlotsService } from "@/lib/services/meal-slots.service";` and `import { WEEKDAY_OPTIONS, WEEKDAY_LABELS } from "../resource-config";`.
- After resolving `def`, build a `dynamicOptions` map for any field with an `optionsSource`:

```ts
  const needsSlots = def.fields.some((f) => f.optionsSource === "mealSlots");
  const slotRows = needsSlots ? await mealSlotsService.enabledSlots() : [];
  const dynamicOptions: Record<string, { value: string; label: string }[]> = {};
  for (const f of def.fields) {
    if (f.optionsSource === "mealSlots") {
      dynamicOptions[f.key] = slotRows.map((s) => ({ value: s.key, label: s.label }));
    } else if (f.optionsSource === "weekdays") {
      dynamicOptions[f.key] = WEEKDAY_OPTIONS.map((d) => ({ value: d, label: WEEKDAY_LABELS[d] }));
    }
  }
```
- Pass `dynamicOptions` to `<ResourceEditor ... dynamicOptions={dynamicOptions} />`.

- [ ] **Step 3: Render the new controls in `resource-editor.tsx`**

Update `ResourceEditor` + `FieldInputs` to accept and render `dynamicOptions`, friendly labels, units, multiselect, and date.

Add `dynamicOptions` to the props of both `ResourceEditor` and `FieldInputs`, threading it down. Replace the `FieldInputs` body field rendering with:

```tsx
function FieldInputs({
  def,
  values,
  setValues,
  dynamicOptions,
}: {
  def: ResourceDef;
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  dynamicOptions: Record<string, { value: string; label: string }[]>;
}) {
  const set = (k: string, v: string) => setValues({ ...values, [k]: v });
  const toggleMulti = (k: string, value: string, checked: boolean) => {
    const cur = (values[k] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const next = checked ? [...new Set([...cur, value])] : cur.filter((x) => x !== value);
    set(k, next.join(", "));
  };
  const optionsFor = (f: ResourceDef["fields"][number]) =>
    f.optionsSource ? (dynamicOptions[f.key] ?? []) : (f.options ?? []).map((o) => ({ value: o, label: f.optionLabels?.[o] ?? o }));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {def.fields.map((f) => {
        const selected = new Set((values[f.key] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
        return (
          <div key={f.key}>
            <Label>{f.label}{f.optional ? <span className="text-muted-foreground"> (optional)</span> : null}</Label>
            {f.type === "select" ? (
              <Select value={values[f.key] ?? ""} onValueChange={(v) => set(f.key, v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{optionsFor(f).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            ) : f.type === "multiselect" ? (
              <div className="mt-1 flex flex-wrap gap-2">
                {optionsFor(f).map((o) => (
                  <label key={o.value} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
                    <input type="checkbox" checked={selected.has(o.value)} onChange={(e) => toggleMulti(f.key, o.value, e.target.checked)} />
                    {o.label}
                  </label>
                ))}
              </div>
            ) : f.type === "date" ? (
              <Input type="date" value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <div className="flex items-center gap-1">
                {f.unit === "$" ? <span className="text-muted-foreground text-sm">$</span> : null}
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
                {f.unit && f.unit !== "$" ? <span className="text-muted-foreground text-sm">{f.unit}</span> : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

Update `ResourceEditor`'s signature to `({ resource, def, rows, dynamicOptions }: { ...; dynamicOptions: Record<string, { value: string; label: string }[]> })` and pass `dynamicOptions` into `<FieldInputs .../>`.

- [ ] **Step 4: Typecheck + build**

Run:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm typecheck
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build
```
Expected: clean. Reseed if a prior step wiped the DB (none here).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/catalog/resource-config.ts" "apps/web/app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx" "apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx"
git commit -m "feat(catalog): typed, user-friendly admin controls (multiselect/date, labels, units, dynamic options)"
```

---

### Task 5: Remove unused catalog items + full green gate

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/resource-config.ts` (remove `addons` resource)
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx` (remove `addons` from `TABLES`)
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/actions.ts` (remove `addons` from `SERVICES`)
- Modify: `apps/web/db/seed-catalog.ts` (stop seeding `addons`)

**Interfaces:** none new — removal only.

- [ ] **Step 1: Confirm `addons` is unused by live code**

Run: `cd apps/web && rg -n "addons|addonService|pricePerWeek" app components lib db --glob '!**/migrations/**'`
Expected: matches only in the four files listed above (catalog config/page/actions/seed) and the schema/service definition — NOT in pricing (`build-catalog.ts` no longer reads addons), orders, or the wizard. If a live pricing/order/UI reference appears, STOP and report it instead of removing.

- [ ] **Step 2: Remove the `addons` admin surface + seed**

- `resource-config.ts`: delete the entire `addons: { ... }` entry from `RESOURCES`.
- `[resource]/page.tsx`: remove `addons` from the `TABLES` map and drop `addons` from the `@/db/schema` import.
- `actions.ts`: remove `addons: addonService,` from `SERVICES` and drop `addonService` from the import.
- `seed-catalog.ts`: remove the `ADDONS` constant and its seed loop, and drop `addons` from the schema import. (Leave the `addons` table + `addonService` definition in `db/schema/catalog.ts` and `catalog.service.ts` — table/column cleanup is a later slice.)

Note: `delivery-frequencies.courierDiscountPct` and `duration-packages.discountPct` fields were already removed from `resource-config.ts` in Task 4.

- [ ] **Step 3: Full green gate**

Run:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm test
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm typecheck
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build
```
Expected: all pass (`next-id` monotonicity is a KNOWN pre-existing flaky under full-suite load — not introduced here). Reseed after tests:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:catalog && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:menu && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:admin
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/catalog/resource-config.ts" "apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx" "apps/web/app/(dashboard)/dashboard/catalog/actions.ts" apps/web/db/seed-catalog.ts
git commit -m "chore(catalog): remove unused addons resource from admin + seed"
```

---

## Self-Review

**Spec coverage:**
- A. Start date → Task 1 (helpers) + Task 2 (schema/validate/wiring) + Task 3 (UI). ✓
- B. Plan-type slots → Task 3 (step-schedule single/multi; step-baseline reset); server enforced (Slice 1). ✓
- C. Remove stale discount UI → Task 3 (step-duration label) + Task 4 (editor fields removed). ✓
- D. Transparency → Task 3 (invoice nudge). ✓
- E. Copy → Task 3 (button + step label). ✓
- F. Catalog revamp (multiselect/date, friendly labels, units, dynamic options, per-resource audit) → Task 4. ✓
- Remove unused (addons + deprecated discount fields) → Task 4 (fields) + Task 5 (addons resource). ✓
- TD-1 commons helpers → Task 1. TD-3 typed controls → Task 4. ✓
- Tests (weekday helpers, validateStartDate, fixtures, gate) → Tasks 1, 2, 5. ✓

**Placeholder scan:** No TBD/TODO; each code step has concrete code. Step-2-of-Task-5 grep is a guarded conditional removal (stop-if-referenced), not a placeholder.

**Type consistency:** `Weekday`/`weekdayKey`/`nextWeekday`/`parseIsoDateUtc`/`isWeekend` defined in Task 1, used in Tasks 2 & 3. `validateStartDate(startDate, allowedStartDays, today)` defined Task 2 Step 3, called Task 2 Step 8. `PricingSelections.startDate` added Task 2, defaulted Task 2 Step 9, set in UI Task 3. `FieldType`/`FieldDef`/`dynamicOptions` defined Task 4 Step 1–3 and consumed consistently. `allowedStartDays` column (Task 2) ↔ snapshot (Task 2) ↔ admin multiselect (Task 4) ↔ validator (Task 2).

## Out of scope
Per-day meal-selection form + rolling cutoff (Slice 3, incl. rolling-start → menu-week mapping), agent CRM management (Slice 4), coupons, dropping deprecated DB columns/tables.
