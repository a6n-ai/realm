# Meal Selection + Rolling Cutoff (Slice 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer pick dishes for their coming service week (subscription-scoped) with a rolling per-day cutoff anchored to a configurable app timezone, replacing the external survey.

**Architecture:** Add DST-aware time helpers to `@tiffin/commons` (epoch-ms ↔ wall-clock in a named zone). Add a singleton `appSettings` (timezone + cutoffHour) read by all conversions. Derive a subscription's delivery dates with a pure count-matched-rolling function and the "coming week" Monday. Rework `dashboard/meals` to show the coming released week scoped to those dates with per-day locks, and gate `selections.service` per-day.

**Tech Stack:** Next.js 16 (MODIFIED — read `node_modules/next/dist/docs/` before framework code), Drizzle ORM + drizzle-kit, Postgres, Vitest, pnpm monorepo. DS in `apps/web/components/ds/`.

## Global Constraints

- App commands run from `apps/web/`; `@tiffin/commons` commands from `packages/commons/`.
- drizzle-kit/tsx/vitest do NOT load `.env.local` — prefix app DB commands with `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin"`.
- Tests wipe the dev DB; after a test run reseed: `pnpm db:seed && pnpm db:seed:catalog && pnpm db:seed:menu && pnpm db:seed:admin` (each DB-prefixed).
- Vitest can't eval NextAuth: a test importing a session service must `vi.mock("@/lib/auth", () => ({ auth: async () => null }))` then `await import(...)`.
- **Time semantics (TD-4):** store/compare absolute epoch-ms; for any wall-clock conversion read the app timezone from `appSettings`; derive zone offsets per-instant from `Intl` (DST-correct), never hardcoded; display delivery times labeled with the zone.
- Dual-id (bigint + public_id nanoid). Shared code → `commons` (TD-1). Admin controls typed (TD-3).
- Commit messages plain, NO `Co-Authored-By`.
- Per-task: end green (`pnpm typecheck` + the task's tests). Final gate (Task 6): `pnpm test && pnpm typecheck && pnpm build`.
- Branch `crm/slice-3-meal-selection` (already created).
- Weekday keys: `"mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"`. `menuWeeks.weekStart` is a `date` column returning a `"YYYY-MM-DD"` string (Monday).

---

### Task 1: DST-aware time helpers in `@tiffin/commons` (TD-4)

**Files:**
- Create: `packages/commons/src/util/zoned-time.ts`
- Create: `packages/commons/src/util/zoned-time.test.ts`
- Modify: `packages/commons/src/index.ts`

**Interfaces:**
- Consumes: `parseIsoDateUtc` from `./dates` (Slice 1).
- Produces: `tzOffsetMinutes(timezone: string, utcMs: number): number` — zone offset in minutes at that instant (e.g. Toronto winter −300, summer −240).
- Produces: `zonedDateIso(utcMs: number, timezone: string): string` — the `YYYY-MM-DD` calendar date at that instant in `timezone`.
- Produces: `cutoffMsFor(deliveryDateIso: string, cutoffHour: number, timezone: string): number` — epoch-ms of `cutoffHour:00` wall-clock in `timezone` on the day **before** `deliveryDateIso`.

- [ ] **Step 1: Write the failing test**

Create `packages/commons/src/util/zoned-time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cutoffMsFor, tzOffsetMinutes, zonedDateIso } from "./zoned-time";

const TZ = "America/Toronto";

describe("tzOffsetMinutes (America/Toronto)", () => {
  it("is -300 in winter (EST)", () => {
    expect(tzOffsetMinutes(TZ, Date.UTC(2026, 0, 15, 12))).toBe(-300); // Jan
  });
  it("is -240 in summer (EDT)", () => {
    expect(tzOffsetMinutes(TZ, Date.UTC(2026, 6, 15, 12))).toBe(-240); // Jul
  });
});

describe("zonedDateIso", () => {
  it("returns the local calendar date in the zone", () => {
    // 2026-01-16 00:30 UTC is still 2026-01-15 (19:30) in Toronto
    expect(zonedDateIso(Date.UTC(2026, 0, 16, 0, 30), TZ)).toBe("2026-01-15");
  });
});

describe("cutoffMsFor", () => {
  it("is 6pm Toronto the day before, in winter", () => {
    // delivery Fri 2026-01-16 → cutoff Thu 2026-01-15 18:00 EST (-05:00)
    const ms = cutoffMsFor("2026-01-16", 18, TZ);
    expect(ms).toBe(Date.UTC(2026, 0, 15, 23, 0)); // 18:00 -05:00 = 23:00 UTC
  });
  it("is 6pm Toronto the day before, in summer (DST shifts by an hour)", () => {
    // delivery Fri 2026-07-17 → cutoff Thu 2026-07-16 18:00 EDT (-04:00) = 22:00 UTC
    const ms = cutoffMsFor("2026-07-17", 18, TZ);
    expect(ms).toBe(Date.UTC(2026, 6, 16, 22, 0));
  });
  it("honors a different cutoff hour", () => {
    expect(cutoffMsFor("2026-01-16", 20, TZ)).toBe(Date.UTC(2026, 0, 16, 1, 0)); // 20:00 -05:00
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `packages/commons/`): `pnpm test src/util/zoned-time.test.ts`
Expected: FAIL — `Cannot find module './zoned-time'`.

- [ ] **Step 3: Implement the helpers**

Create `packages/commons/src/util/zoned-time.ts`:

```ts
import { parseIsoDateUtc } from "./dates";

// Offset (minutes) of `timezone` from UTC at instant `utcMs`. Negative west of UTC
// (Toronto = -300 EST / -240 EDT). Derived per-instant from Intl, so DST-correct.
export function tzOffsetMinutes(timezone: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  // Reinterpret the wall-clock parts as if they were UTC, then diff against the real instant.
  let hour = Number(p.hour);
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
  return Math.round((asUtc - utcMs) / 60000);
}

// The YYYY-MM-DD calendar date at instant `utcMs` in `timezone`.
export function zonedDateIso(utcMs: number, timezone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// Epoch-ms of `cutoffHour`:00 wall-clock in `timezone`, on the day BEFORE deliveryDateIso.
export function cutoffMsFor(deliveryDateIso: string, cutoffHour: number, timezone: string): number {
  const d = parseIsoDateUtc(deliveryDateIso);
  d.setUTCDate(d.getUTCDate() - 1); // day before
  // First guess: treat cutoffHour as if UTC, then correct by the zone offset at that instant.
  const guess = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), cutoffHour);
  const offset = tzOffsetMinutes(timezone, guess);
  return guess - offset * 60000;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run (from `packages/commons/`): `pnpm test src/util/zoned-time.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Export + commit**

In `packages/commons/src/index.ts` add `export * from "./util/zoned-time";`.

```bash
git add packages/commons/src/util/zoned-time.ts packages/commons/src/util/zoned-time.test.ts packages/commons/src/index.ts
git commit -m "feat(commons): DST-aware zoned-time helpers (tzOffsetMinutes, zonedDateIso, cutoffMsFor)"
```

---

### Task 2: `appSettings` singleton — schema, service, seed, admin page

**Files:**
- Create: `apps/web/db/schema/app-settings.ts`
- Modify: `apps/web/db/schema/index.ts`
- Create: `apps/web/lib/services/app-settings.service.ts`
- Create: `apps/web/lib/services/__tests__/app-settings.service.test.ts`
- Modify: `apps/web/db/seed.ts`
- Create: `apps/web/app/(dashboard)/dashboard/settings/general/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/settings/general/actions.ts`
- Create: `apps/web/app/(dashboard)/dashboard/settings/general/settings-form.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/settings/page.tsx`

**Interfaces:**
- Produces: `getAppSettings(): Promise<{ timezone: string; cutoffHour: number }>` — the singleton row, or defaults `{ timezone: "America/Toronto", cutoffHour: 18 }` if empty.
- Produces: `saveAppSettings(input: { timezone: string; cutoffHour: number }): Promise<void>` (server action, admin-guarded).
- Produces: `appSettings` table.

- [ ] **Step 1: Write the failing service test**

Create `apps/web/lib/services/__tests__/app-settings.service.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { getAppSettings } from "../app-settings.service";

async function reset() { await db.delete(appSettings); }

describe("getAppSettings", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns defaults when no row exists", async () => {
    const s = await getAppSettings();
    expect(s).toEqual({ timezone: "America/Toronto", cutoffHour: 18 });
  });

  it("returns the stored row when present", async () => {
    await db.insert(appSettings).values({ timezone: "America/Vancouver", cutoffHour: 20 });
    const s = await getAppSettings();
    expect(s).toEqual({ timezone: "America/Vancouver", cutoffHour: 20 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/app-settings.service.test.ts`
Expected: FAIL — `appSettings`/`getAppSettings` not found.

- [ ] **Step 3: Add the schema**

Create `apps/web/db/schema/app-settings.ts`:

```ts
import { updatableColumns } from "@tiffin/commons-drizzle";
import { integer, pgTable, text } from "drizzle-orm/pg-core";

// Singleton: exactly one row holds app-wide settings.
export const appSettings = pgTable("app_settings", {
  ...updatableColumns("aps"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  cutoffHour: integer("cutoff_hour").notNull().default(18),
});
```

Add to `apps/web/db/schema/index.ts`: `export * from "./app-settings";`.

- [ ] **Step 4: Implement the service**

Create `apps/web/lib/services/app-settings.service.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";

const DEFAULTS = { timezone: "America/Toronto", cutoffHour: 18 } as const;

export async function getAppSettings(): Promise<{ timezone: string; cutoffHour: number }> {
  const [row] = await db.select().from(appSettings).limit(1);
  if (!row) return { ...DEFAULTS };
  return { timezone: row.timezone, cutoffHour: row.cutoffHour };
}

export async function setAppSettings(input: { timezone: string; cutoffHour: number }): Promise<void> {
  const [row] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (row) {
    await db.update(appSettings).set({ timezone: input.timezone, cutoffHour: input.cutoffHour }).where(eq(appSettings.publicId, row.publicId));
  } else {
    await db.insert(appSettings).values({ timezone: input.timezone, cutoffHour: input.cutoffHour });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/app-settings.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Seed the singleton**

In `apps/web/db/seed.ts`, add `appSettings` to the schema import, and inside `main()` (before the final `console.log`):

```ts
  const [existing] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (!existing) await db.insert(appSettings).values({ timezone: "America/Toronto", cutoffHour: 18 });
```

- [ ] **Step 7: Admin settings page + action + form**

Create `apps/web/app/(dashboard)/dashboard/settings/general/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@tiffin/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { setAppSettings } from "@/lib/services/app-settings.service";

export async function saveAppSettings(input: { timezone: string; cutoffHour: number }) {
  await requireAdmin();
  if (!input.timezone) throw new ValidationError("Timezone is required");
  if (!Number.isInteger(input.cutoffHour) || input.cutoffHour < 0 || input.cutoffHour > 23) {
    throw new ValidationError("Cutoff hour must be an integer 0–23");
  }
  await setAppSettings(input);
  revalidatePath("/dashboard/settings/general");
}
```

Create `apps/web/app/(dashboard)/dashboard/settings/general/settings-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveAppSettings } from "./actions";

const ZONES = ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "Asia/Kolkata", "UTC"];

export function SettingsForm({ timezone, cutoffHour }: { timezone: string; cutoffHour: number }) {
  const router = useRouter();
  const [tz, setTz] = useState(timezone);
  const [hour, setHour] = useState(String(cutoffHour));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await saveAppSettings({ timezone: tz, cutoffHour: Number(hour) });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });

  return (
    <div className="grid max-w-md gap-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div>
        <Label>App timezone</Label>
        <Select value={tz} onValueChange={setTz}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1 text-xs">Used for all delivery cutoffs and time display.</p>
      </div>
      <div>
        <Label>Selection cutoff hour (0–23)</Label>
        <Input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(e.target.value)} />
        <p className="text-muted-foreground mt-1 text-xs">Orders for a day lock at this hour the day before, in the app timezone.</p>
      </div>
      <Button onClick={save} disabled={pending} className="w-fit">Save</Button>
    </div>
  );
}
```

Create `apps/web/app/(dashboard)/dashboard/settings/general/page.tsx`:

```tsx
import { SettingsIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { SettingsForm } from "./settings-form";

export default async function GeneralSettingsPage() {
  await requireAdmin();
  const settings = await getAppSettings();
  return (
    <PageShell>
      <PageHeader icon={SettingsIcon} title="General" subtitle="App timezone and order cutoff" />
      <SectionCard title="Time & cutoff">
        <SettingsForm timezone={settings.timezone} cutoffHour={settings.cutoffHour} />
      </SectionCard>
    </PageShell>
  );
}
```

In `apps/web/app/(dashboard)/dashboard/settings/page.tsx`, add a card to the `SETTINGS` array:

```ts
  {
    title: "General",
    description: "App timezone and meal-selection cutoff.",
    href: "/dashboard/settings/general",
    icon: SettingsIcon,
  },
```
(`SettingsIcon` is already imported in that file.)

- [ ] **Step 8: Migrate, reseed, typecheck, test, commit**

Run:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:generate
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm typecheck
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/app-settings.service.test.ts
```
Expected: migration applies `app_settings`; typecheck clean; test passes. NOTE: if `pnpm db:generate` requires a TTY (column-conflict prompt) and fails non-interactively, write the migration SQL by hand: a new numbered file in `db/migrations/` with `CREATE TABLE "app_settings" (...)` matching the schema (copy column defs + the `updatableColumns` columns from an existing migration's pattern) and add its entry to `db/migrations/meta/_journal.json`. Then `pnpm db:migrate`.

```bash
git add apps/web/db/schema/app-settings.ts apps/web/db/schema/index.ts apps/web/lib/services/app-settings.service.ts apps/web/lib/services/__tests__/app-settings.service.test.ts apps/web/db/seed.ts apps/web/db/migrations "apps/web/app/(dashboard)/dashboard/settings/general" "apps/web/app/(dashboard)/dashboard/settings/page.tsx"
git commit -m "feat(settings): add appSettings singleton (timezone + cutoff hour) with admin page"
```

---

### Task 3: Subscription delivery-date derivation (`lib/menu/delivery-dates.ts`)

**Files:**
- Create: `apps/web/lib/menu/delivery-dates.ts`
- Create: `apps/web/lib/menu/__tests__/delivery-dates.test.ts`

**Interfaces:**
- Consumes: `parseIsoDateUtc`, `weekdayKey`, `zonedDateIso` from `@tiffin/commons`.
- Produces: `type DeliveryDate = { dateIso: string; dayOfWeek: DayOfWeek; weekStartIso: string }`.
- Produces: `subscriptionDeliveryDates(input: { startDate: string; durationWeeks: number; deliveryDays: DayOfWeek[] }): DeliveryDate[]` — count-matched rolling set.
- Produces: `mondayOfIso(dateIso: string): string` — Monday of that date's week.
- Produces: `comingWeekStartIso(nowMs: number, timezone: string): string` — the Monday that starts the week AFTER the current week, in `timezone` (the coming service week).

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/menu/__tests__/delivery-dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { comingWeekStartIso, mondayOfIso, subscriptionDeliveryDates } from "../delivery-dates";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"] as const;

describe("mondayOfIso", () => {
  it("returns the Monday of the week", () => {
    expect(mondayOfIso("2026-06-24")).toBe("2026-06-22"); // Wed -> Mon
    expect(mondayOfIso("2026-06-22")).toBe("2026-06-22"); // Mon -> Mon
    expect(mondayOfIso("2026-06-28")).toBe("2026-06-22"); // Sun -> Mon
  });
});

describe("subscriptionDeliveryDates", () => {
  it("emits durationWeeks × deliveryDays.length dates, starting on/after startDate", () => {
    // Start Wed 2026-06-24, 5 weekdays, 2 weeks = 10 dates
    const r = subscriptionDeliveryDates({ startDate: "2026-06-24", durationWeeks: 2, deliveryDays: [...WEEKDAYS] });
    expect(r).toHaveLength(10);
    expect(r[0].dateIso).toBe("2026-06-24");
    expect(r[0].dayOfWeek).toBe("wed");
    expect(r[0].weekStartIso).toBe("2026-06-22");
    // last of the 10: Wed start → Wed,Thu,Fri (wk1 partial 3) then Mon..Fri (wk2 5) then Mon,Tue (2) = 10
    expect(r[r.length - 1].dateIso).toBe("2026-07-07"); // Tue
  });

  it("only includes the configured delivery weekdays", () => {
    const r = subscriptionDeliveryDates({ startDate: "2026-06-22", durationWeeks: 1, deliveryDays: ["mon", "wed", "fri"] });
    expect(r.map((d) => d.dayOfWeek)).toEqual(["mon", "wed", "fri"]);
    expect(r.map((d) => d.dateIso)).toEqual(["2026-06-22", "2026-06-24", "2026-06-26"]);
  });
});

describe("comingWeekStartIso", () => {
  it("returns next week's Monday relative to 'now' in the zone", () => {
    // Wed 2026-06-24 12:00 UTC, Toronto → current week Mon = 06-22, coming = 06-29
    const now = Date.UTC(2026, 5, 24, 16); // ~noon Toronto
    expect(comingWeekStartIso(now, "America/Toronto")).toBe("2026-06-29");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/menu/__tests__/delivery-dates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/web/lib/menu/delivery-dates.ts`:

```ts
import { parseIsoDateUtc, weekdayKey, zonedDateIso } from "@tiffin/commons";

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type DeliveryDate = { dateIso: string; dayOfWeek: DayOfWeek; weekStartIso: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Monday of the week containing dateIso (UTC date math).
export function mondayOfIso(dateIso: string): string {
  const d = parseIsoDateUtc(dateIso);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const deltaToMonday = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + deltaToMonday);
  return iso(d);
}

// First durationWeeks × deliveryDays.length delivery dates on/after startDate.
export function subscriptionDeliveryDates(input: {
  startDate: string;
  durationWeeks: number;
  deliveryDays: DayOfWeek[];
}): DeliveryDate[] {
  const want = new Set(input.deliveryDays);
  const total = input.durationWeeks * input.deliveryDays.length;
  const out: DeliveryDate[] = [];
  const d = parseIsoDateUtc(input.startDate);
  // Walk forward day-by-day, collecting matching weekdays until we have `total`.
  // Guard the loop generously (total weeks of calendar days is plenty).
  for (let guard = 0; out.length < total && guard < total * 7 + 14; guard++) {
    const dow = weekdayKey(d);
    if (want.has(dow)) {
      const dateIso = iso(d);
      out.push({ dateIso, dayOfWeek: dow, weekStartIso: mondayOfIso(dateIso) });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// The Monday starting the week AFTER the current week, in `timezone` (coming service week).
export function comingWeekStartIso(nowMs: number, timezone: string): string {
  const todayIso = zonedDateIso(nowMs, timezone);
  const thisMonday = parseIsoDateUtc(mondayOfIso(todayIso));
  thisMonday.setUTCDate(thisMonday.getUTCDate() + 7);
  return iso(thisMonday);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/menu/__tests__/delivery-dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/menu/delivery-dates.ts apps/web/lib/menu/__tests__/delivery-dates.test.ts
git commit -m "feat(menu): subscription delivery-date derivation + coming-week helper"
```

---

### Task 4: Labeled time formatting (`lib/format/datetime.ts`)

**Files:**
- Modify: `apps/web/lib/format/datetime.ts`
- Create: `apps/web/lib/format/__tests__/datetime.test.ts`

**Interfaces:**
- Produces: `formatEpoch(ms, { timeZone?, mode?, withZone? })` — `withZone: true` appends the zone abbreviation.
- Produces: `formatDeliveryTime(ms: number, timezone: string): string` — labeled datetime in the app timezone.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/format/__tests__/datetime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDeliveryTime, formatEpoch } from "../datetime";

describe("formatEpoch withZone", () => {
  it("appends a zone label when withZone is set", () => {
    const ms = Date.UTC(2026, 0, 15, 23, 0); // 6pm EST
    const s = formatEpoch(ms, { timeZone: "America/Toronto", mode: "datetime", withZone: true });
    expect(s).toMatch(/EST/);
  });
  it("omits the zone label by default", () => {
    const ms = Date.UTC(2026, 0, 15, 23, 0);
    const s = formatEpoch(ms, { timeZone: "America/Toronto", mode: "datetime" });
    expect(s).not.toMatch(/EST|EDT/);
  });
});

describe("formatDeliveryTime", () => {
  it("renders a labeled datetime in the given zone", () => {
    const ms = Date.UTC(2026, 6, 16, 22, 0); // 6pm EDT
    expect(formatDeliveryTime(ms, "America/Toronto")).toMatch(/EDT/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/format/__tests__/datetime.test.ts`
Expected: FAIL — `withZone`/`formatDeliveryTime` not present.

- [ ] **Step 3: Implement**

In `apps/web/lib/format/datetime.ts`, update the `formatEpoch` signature + body and add `formatDeliveryTime`:

```ts
export function formatEpoch(
  ms: number,
  opts: { timeZone?: string; mode?: FormatMode; withZone?: boolean } = {},
): string {
  const { mode = "datetime", timeZone, withZone } = opts;
  if (mode === "relative") {
    const diff = ms - Date.now();
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const mins = Math.round(diff / 60000);
    if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
    return rtf.format(Math.round(hours / 24), "day");
  }
  const presetOpts = PRESETS[mode];
  return new Intl.DateTimeFormat(undefined, {
    ...presetOpts,
    timeZone,
    ...(withZone ? { timeZoneName: "short" } : {}),
  }).format(ms);
}

// Labeled datetime in the app/delivery timezone (e.g. "Jul 16, 2026, 6:00 PM EDT").
export function formatDeliveryTime(ms: number, timezone: string): string {
  return formatEpoch(ms, { timeZone: timezone, mode: "datetime", withZone: true });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/format/__tests__/datetime.test.ts`
Expected: PASS. (If a runtime emits a different short-zone token, assert on the presence of a non-empty trailing token instead — but Node's ICU emits EST/EDT for America/Toronto.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/format/datetime.ts apps/web/lib/format/__tests__/datetime.test.ts
git commit -m "feat(format): zone-labeled time formatting (formatEpoch withZone, formatDeliveryTime)"
```

---

### Task 5: Per-day cutoff + span check in `selections.service`

**Files:**
- Modify: `apps/web/lib/menu/selections.service.ts`
- Create: `apps/web/lib/menu/__tests__/selections-cutoff.test.ts`

**Interfaces:**
- Consumes: `getAppSettings` (Task 2), `cutoffMsFor` (Task 1), `subscriptionDeliveryDates` + `mondayOfIso` (Task 3), `orderDeliveryDays` (`lib/menu/delivery-days.ts`).
- Modifies: `selectionsService.setSelection` — same input shape, new gating.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/menu/__tests__/selections-cutoff.test.ts`. It seeds an order + menu week + dish/menu item, sets `appSettings` to a known timezone/hour, and asserts a pick before cutoff succeeds and after cutoff throws, plus a day outside the subscription throws.

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings, deliveryFrequencies, dishes, mealSelections, menuItems, menuWeeks, orders, plans, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { selectionsService } = await import("../selections.service");

let order: typeof orders.$inferSelect;
let week: typeof menuWeeks.$inferSelect;
let dishPublicId: string;

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
  await db.delete(orders); await db.delete(dishes); await db.delete(appSettings);
}

describe("setSelection per-day cutoff + span", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(appSettings).values({ timezone: "America/Toronto", cutoffHour: 18 });
    const [u] = await db.insert(users).values({ phone: "+15550000001", name: "T", role: "user", passwordHash: "x" }).onConflictDoNothing().returning();
    const userId = u?.id ?? (await db.select().from(users).where(eq(users.phone, "+15550000001")).limit(1))[0].id;
    const [plan] = await db.select().from(plans).where(eq(plans.key, "veg")).limit(1);
    const [freq] = await db.select().from(deliveryFrequencies).where(eq(deliveryFrequencies.key, "5_day")).limit(1);
    const [mealSize] = await db.select().from((await import("@/db/schema")).mealSizes).limit(1);
    // Menu week starting a Monday far in the future so cutoffs are open.
    const [w] = await db.insert(menuWeeks).values({ weekStart: "2099-01-05", status: "released", orderCutoff: 4070000000000 }).returning(); // 2099 Mon
    week = w;
    const [d] = await db.insert(dishes).values({ name: "Dal", diet: "veg", slots: ["lunch"], active: true }).returning();
    dishPublicId = d.publicId;
    await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "lunch", dishId: d.id, isDefault: true });
    const [o] = await db.insert(orders).values({
      userId, planId: plan.id, mealSizeId: mealSize.id, frequencyId: freq.id, persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: "2099-01-05",
      pricingSnapshot: {}, tiffinCount: 5, perTiffinPrice: "10.00", total: "50.00", status: "active",
      deploymentId: "SUB-cutoff-test", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V",
    }).returning();
    order = o;
  });
  afterAll(reset);

  it("accepts a pick well before the cutoff", async () => {
    await selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishPublicId });
    const [row] = await db.select().from(mealSelections).where(and(eq(mealSelections.orderId, order.id), eq(mealSelections.dayOfWeek, "mon")));
    expect(row).toBeTruthy();
  });

  it("rejects a day not in the subscription delivery set (Saturday, not a delivery day)", async () => {
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "sat", slot: "lunch", dishId: (await db.select().from(dishes).limit(1))[0].id });
    await expect(
      selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "sat", slot: "lunch", personIndex: 1, dishPublicId }),
    ).rejects.toThrow();
  });

  it("rejects after the cutoff has passed", async () => {
    const [past] = await db.insert(menuWeeks).values({ weekStart: "2000-01-03", status: "released", orderCutoff: 1 }).returning(); // 2000 Mon, long past
    await db.insert(menuItems).values({ menuWeekId: past.id, dayOfWeek: "mon", slot: "lunch", dishId: (await db.select().from(dishes).limit(1))[0].id, isDefault: true });
    const pastOrder = { ...order, startDate: "2000-01-03" };
    await expect(
      selectionsService.setSelection({ order: pastOrder, menuWeek: past, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishPublicId }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/menu/__tests__/selections-cutoff.test.ts`
Expected: FAIL (current `setSelection` uses per-week `menuWeek.orderCutoff`, no span check). Reseed catalog after: `DATABASE_URL=... pnpm db:seed:catalog`.

- [ ] **Step 3: Rewrite the gating in `setSelection`**

In `apps/web/lib/menu/selections.service.ts`, replace the per-week cutoff line and add a span + per-day cutoff. Full updated file:

```ts
import { ValidationError } from "@tiffin/commons";
import { cutoffMsFor } from "@tiffin/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryFrequencies, dishes, mealSelections, menuItems, menuWeeks, orders, plans } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { orderDeliveryDays } from "@/lib/menu/delivery-days";
import { subscriptionDeliveryDates, mondayOfIso, type DayOfWeek } from "@/lib/menu/delivery-dates";

type Order = typeof orders.$inferSelect;
type Week = typeof menuWeeks.$inferSelect;

const DAY_OFFSET: Record<DayOfWeek, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function dietsForPlanKey(planKey: string): ("veg" | "nonveg")[] {
  if (planKey === "veg") return ["veg"];
  if (planKey === "halal_nonveg") return ["nonveg"];
  return ["veg", "nonveg"];
}

// The ISO date of `dayOfWeek` within the menu week starting on weekStart.
function dateInWeek(weekStartIso: string, dayOfWeek: DayOfWeek): string {
  const d = new Date(`${weekStartIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + DAY_OFFSET[dayOfWeek]);
  return d.toISOString().slice(0, 10);
}

export const selectionsService = {
  async setSelection(input: { order: Order; menuWeek: Week; dayOfWeek: DayOfWeek; slot: string; personIndex: number; dishPublicId: string }) {
    const { order, menuWeek, dayOfWeek, slot, personIndex, dishPublicId } = input;
    if (personIndex < 1 || personIndex > order.persons) throw new ValidationError("Invalid person");

    const deliveryDateIso = dateInWeek(menuWeek.weekStart, dayOfWeek);

    // The day must be part of this subscription's delivery set.
    const [freq] = await db.select({ key: deliveryFrequencies.key }).from(deliveryFrequencies).where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
    const deliveryDays = orderDeliveryDays({ frequencyKey: freq?.key ?? "5_day", includeSaturday: order.includeSaturday, includeSunday: order.includeSunday }) as DayOfWeek[];
    const dates = subscriptionDeliveryDates({ startDate: order.startDate, durationWeeks: order.durationWeeks, deliveryDays });
    if (!dates.some((d) => d.dateIso === deliveryDateIso)) {
      throw new ValidationError("That day isn't part of your subscription");
    }

    // Per-day rolling cutoff in the app timezone.
    const { timezone, cutoffHour } = await getAppSettings();
    if (Date.now() > cutoffMsFor(deliveryDateIso, cutoffHour, timezone)) {
      throw new ValidationError("Selections are locked — the cutoff for that day has passed");
    }

    const [dishRow] = await db.select({ id: dishes.id, diet: dishes.diet }).from(dishes).where(eq(dishes.publicId, dishPublicId)).limit(1);
    if (!dishRow) throw new ValidationError("Dish not found");
    const dishId = dishRow.id;

    const [item] = await db.select().from(menuItems).where(and(
      eq(menuItems.menuWeekId, menuWeek.id), eq(menuItems.dayOfWeek, dayOfWeek), eq(menuItems.slot, slot), eq(menuItems.dishId, dishId),
    )).limit(1);
    if (!item) throw new ValidationError("Dish is not available for that day and slot");

    const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.id, order.planId)).limit(1);
    if (!plan || !dietsForPlanKey(plan.key).includes(dishRow.diet)) throw new ValidationError("Dish does not match your plan");

    await db.insert(mealSelections).values({ orderId: order.id, menuWeekId: menuWeek.id, dayOfWeek, slot, personIndex, dishId })
      .onConflictDoUpdate({
        target: [mealSelections.orderId, mealSelections.menuWeekId, mealSelections.dayOfWeek, mealSelections.slot, mealSelections.personIndex],
        set: { dishId },
      });
  },

  async effectiveSelections(orderId: bigint, menuWeekId: bigint) {
    const picks = await db.select().from(mealSelections)
      .where(and(eq(mealSelections.orderId, orderId), eq(mealSelections.menuWeekId, menuWeekId)));
    return picks;
  },
};
```

(`mondayOfIso` import kept available for the meals page; remove it here if your linter flags it as unused — `dateInWeek` does the offset locally.)

- [ ] **Step 4: Run it to verify it passes**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/menu/__tests__/selections-cutoff.test.ts lib/menu/__tests__/selections.service.test.ts`
Expected: PASS. Reseed catalog after the run: `DATABASE_URL=... pnpm db:seed:catalog && DATABASE_URL=... pnpm db:seed:menu`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/menu/selections.service.ts apps/web/lib/menu/__tests__/selections-cutoff.test.ts
git commit -m "feat(menu): per-day rolling cutoff + subscription-span check in setSelection"
```

---

### Task 6: Meals page (coming week, per-day lock) + activate relink + full gate

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/meals/page.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/meals/meals-grid.tsx`
- Modify: `apps/web/app/(public)/activate/[deploymentId]/page.tsx`

**Interfaces:**
- Consumes: `getAppSettings` (T2), `comingWeekStartIso` + `subscriptionDeliveryDates` (T3), `cutoffMsFor` (T1), `formatDeliveryTime` (T4).
- `GridCell` gains `dateIso: string` and `locked: boolean`; `MealsGrid` shows the date and locks per-cell (drop the page-wide `isLocked`).

- [ ] **Step 1: Rework the meals page query to the coming week + per-day cells**

In `apps/web/app/(dashboard)/dashboard/meals/page.tsx`:
- Add imports:
```ts
import { cutoffMsFor } from "@tiffin/commons";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { comingWeekStartIso, subscriptionDeliveryDates, type DeliveryDate } from "@/lib/menu/delivery-dates";
```
- Add `startDate`, `durationWeeks` to the `orderRow` select (`startDate: orders.startDate`, `durationWeeks: orders.durationWeeks`).
- Replace the released-week lookup with the **coming** week:
```ts
  const { timezone, cutoffHour } = await getAppSettings();
  const comingMonday = comingWeekStartIso(Date.now(), timezone);
  const [releasedWeek] = await db
    .select().from(menuWeeks)
    .where(and(eq(menuWeeks.status, "released"), eq(menuWeeks.weekStart, comingMonday)))
    .limit(1);
```
  (Add `and` to the `drizzle-orm` import.)
- Update `GridCell` type:
```ts
export type GridCell = {
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  dateIso: string;
  slot: string;
  personIndex: number;
  selectedDishId: string | null;
  dishes: { id: string; name: string; diet: "veg" | "nonveg" }[];
  locked: boolean;
};
```
- Compute the subscription's delivery dates and restrict to the coming week:
```ts
  const deliveryDays = orderDeliveryDays({
    frequencyKey: activeOrder.frequencyKey,
    includeSaturday: activeOrder.includeSaturday,
    includeSunday: activeOrder.includeSunday,
  });
  const subDates: DeliveryDate[] = subscriptionDeliveryDates({
    startDate: activeOrder.startDate,
    durationWeeks: activeOrder.durationWeeks,
    deliveryDays,
  });
  const weekDates = subDates.filter((d) => d.weekStartIso === releasedWeek.weekStart);
```
  If `weekDates.length === 0`, render an EmptyState: "No deliveries scheduled for the coming week." (subscription not started/ended).
- Build the grid per delivery DATE (not bare weekday). Replace the `for (const day of deliveryDays)` loop with a loop over `weekDates`, computing each cell's `dateIso` and `locked`:
```ts
  const grid: GridCell[] = [];
  for (const { dateIso, dayOfWeek: day } of weekDates) {
    const locked = Date.now() > cutoffMsFor(dateIso, cutoffHour, timezone);
    const dayItems = allItems.filter((i) => i.dayOfWeek === day);
    const slots = visibleSlots(activeOrder.mealSlots, activeOrder.mealSlots, dayItems);
    for (const slot of slots) {
      const slotItems = dayItems.filter((i) => i.slot === slot);
      const slotDishes = slotItems
        .map((i) => dishMap.get(i.dishId))
        .filter((d): d is { id: string; name: string; diet: "veg" | "nonveg" } => !!d && allowedDiets.includes(d.diet));
      if (slotDishes.length === 0) continue;
      for (let p = 1; p <= activeOrder.persons; p++) {
        const pick = picks.find((sel) => sel.dayOfWeek === day && sel.slot === slot && sel.personIndex === p);
        let selectedDishId: string | null = null;
        if (pick) selectedDishId = dishPublicIdByBigintId.get(pick.dishId) ?? null;
        else {
          const defaultItem = slotItems.find((i) => i.isDefault);
          selectedDishId = defaultItem ? (dishPublicIdByBigintId.get(defaultItem.dishId) ?? null) : null;
        }
        grid.push({ day, dateIso, slot, personIndex: p, selectedDishId, dishes: slotDishes, locked });
      }
    }
  }
```
- Remove the page-wide `isLocked` banner; pass `weekDates` to the grid for row rendering and the `timezone` for labels:
```tsx
      <SectionCard title={`Coming week — meals for ${releasedWeek.weekStart}`}>
        <MealsGrid
          orderId={activeOrder.publicId}
          menuWeekId={releasedWeek.publicId}
          grid={grid}
          persons={activeOrder.persons}
          weekDates={weekDates}
          enabledSlots={orderSlotsRows}
          timezone={timezone}
          cutoffHour={cutoffHour}
        />
      </SectionCard>
```

- [ ] **Step 2: Update `MealsGrid` for dates + per-cell lock**

Rewrite `apps/web/app/(dashboard)/dashboard/meals/meals-grid.tsx` to key rows by delivery DATE and lock per cell. Replace `deliveryDays`/`isLocked` props with `weekDates`/`timezone`/`cutoffHour`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { cutoffMsFor } from "@tiffin/commons";
import { formatDeliveryTime } from "@/lib/format/datetime";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pickDish } from "./actions";
import type { GridCell } from "./page";

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAY_LABELS: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
type SlotMeta = { key: string; label: string; sortOrder: number };
type WeekDate = { dateIso: string; dayOfWeek: DayOfWeek; weekStartIso: string };

type Props = {
  orderId: string;
  menuWeekId: string;
  grid: GridCell[];
  persons: number;
  weekDates: WeekDate[];
  enabledSlots: SlotMeta[];
  timezone: string;
  cutoffHour: number;
};

export function MealsGrid({ orderId, menuWeekId, grid, persons, weekDates, enabledSlots, timezone, cutoffHour }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border p-2 text-left">Delivery</th>
            {enabledSlots.map((s) =>
              Array.from({ length: persons }, (_, i) => (
                <th key={`${s.key}-${i}`} className="border p-2 text-left">
                  {s.label}{persons > 1 && <span className="ml-1 text-xs font-normal text-muted-foreground">P{i + 1}</span>}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {weekDates.map(({ dateIso, dayOfWeek }) => {
            const locked = Date.now() > cutoffMsFor(dateIso, cutoffHour, timezone);
            return (
              <tr key={dateIso}>
                <td className="border p-2 font-medium">
                  <div>{DAY_LABELS[dayOfWeek]} {dateIso}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {locked ? "Locked" : `Edit until ${formatDeliveryTime(cutoffMsFor(dateIso, cutoffHour, timezone), timezone)}`}
                  </div>
                </td>
                {enabledSlots.map((slot) =>
                  Array.from({ length: persons }, (_, i) => {
                    const personIndex = i + 1;
                    const cell = grid.find((c) => c.dateIso === dateIso && c.slot === slot.key && c.personIndex === personIndex);
                    if (!cell) return <td key={`${slot.key}-${personIndex}`} className="border p-2 text-xs text-muted-foreground">—</td>;
                    return <CellSelect key={`${dateIso}-${slot.key}-${personIndex}`} cell={cell} orderId={orderId} menuWeekId={menuWeekId} />;
                  })
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CellSelect({ cell, orderId, menuWeekId }: { cell: GridCell; orderId: string; menuWeekId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  function handleChange(dishId: string) {
    setError(null);
    start(async () => {
      try {
        await pickDish({ orderId, menuWeekId, dayOfWeek: cell.day, slot: cell.slot, personIndex: cell.personIndex, dishId });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save selection");
      }
    });
  }
  return (
    <td className="border p-2 align-top">
      <div className="space-y-1">
        {cell.locked ? (
          <span className="text-sm">{cell.dishes.find((d) => d.id === cell.selectedDishId)?.name ?? "—"}</span>
        ) : (
          <Select value={cell.selectedDishId ?? undefined} onValueChange={handleChange}>
            <SelectTrigger className="h-8 min-w-[140px] text-xs"><SelectValue placeholder="Choose dish" /></SelectTrigger>
            <SelectContent>
              {cell.dishes.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}<span className="ml-1 text-xs text-muted-foreground">({d.diet === "veg" ? "V" : "NV"})</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </td>
  );
}
```

- [ ] **Step 3: Relink the activate page**

In `apps/web/app/(public)/activate/[deploymentId]/page.tsx`, replace the external survey block (the "One more step" / `custom-allocation-form-v3` anchor) with in-app guidance:

```tsx
        <Separator className="my-4" />
        <div className="font-medium">Pick your meals</div>
        <p className="mt-1 text-muted-foreground">
          Log in and open <span className="font-medium">My Meals</span> to choose your dishes for the
          coming week before the cutoff.
        </p>
        <a className="mt-2 inline-block text-primary underline" href="/dashboard/meals">Go to My Meals →</a>
```

- [ ] **Step 4: Full green gate**

Run:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm test
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm typecheck
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build
```
Expected: all pass (`next-id` monotonicity = known pre-existing flaky; if ONLY that fails, gate is green). Reseed after tests:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:catalog && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:menu && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:admin
```

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/meals/page.tsx" "apps/web/app/(dashboard)/dashboard/meals/meals-grid.tsx" "apps/web/app/(public)/activate/[deploymentId]/page.tsx"
git commit -m "feat(meals): coming-week selection scoped to subscription with per-day cutoff; activate links in-app"
```

---

## Self-Review

**Spec coverage:**
- `appSettings` singleton + admin page → Task 2. ✓
- `cutoffMsFor` DST-aware + `tzOffsetMinutes` + `zonedDateIso` → Task 1. ✓
- `formatEpoch` withZone + `formatDeliveryTime` → Task 4. ✓
- `subscriptionDeliveryDates` count-matched rolling + `comingWeekStartIso` → Task 3. ✓
- Meals page coming-week-only, subscription-scoped, per-day lock, labeled times → Task 6. ✓
- `setSelection` per-day cutoff + span check → Task 5. ✓
- activate relink → Task 6. ✓
- Tests (cutoff/DST, offset, delivery dates, formatting, setSelection lock/span) → Tasks 1,3,4,5. ✓
- TD-4 time semantics + TD-1 commons + TD-3 typed settings controls → Tasks 1,2. ✓

**Placeholder scan:** No TBD/TODO; each code step has concrete code. The Task-2 hand-migration note is a conditional fallback (TTY), not a placeholder.

**Type consistency:** `getAppSettings(): {timezone, cutoffHour}` (T2) consumed in T5/T6. `cutoffMsFor(dateIso,hour,tz)` (T1) used in T5/T6. `subscriptionDeliveryDates({startDate,durationWeeks,deliveryDays})` + `DeliveryDate` + `comingWeekStartIso` (T3) used in T5/T6. `GridCell` gains `dateIso`+`locked` (T6) and the grid props change in lockstep. `DayOfWeek` defined in `delivery-dates.ts` (T3) and reused.

## Out of scope
Multi-week-ahead navigation; sweeping all staff-facing timestamps to app TZ (follow-up); agent CRM (Slice 4); coupons; catering; deprecated-column cleanup.
