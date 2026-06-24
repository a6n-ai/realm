# Inquiry CRM Phase 1 — Intake + Activity + Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the usable inquiry CRM: optional intake prefs with dependent source/sub-source selects, typed activity touchpoints with scheduled follow-ups + overdue surfacing, a mark-lost dialog, an inline conversion drawer (RHF + zone-match + dedup + prefill), and an enhanced inquiry table.

**Architecture:** Server Components fetch; mutations are server actions guarded by `requireStaff`. Source/sub-source and prefs are resolved in `inquiriesService` (Phase 0 contract). Conversion moves from the `/order` route into a `Sheet` drawer on the detail page; `OrderForm` migrates from `useState` to RHF+zod. Overdue is computed in the list query, never stored.

**Tech Stack:** Next.js (non-stock — read `node_modules/next/dist/docs/` before UI work), Drizzle, RHF + zod, shadcn (`Sheet`/`Dialog`/`Table`/`Select`/`Form` already in repo), Vitest.

## Global Constraints

- Shared code → `@tiffin/commons{,-drizzle,-next}`, not `apps/web` (TD-1).
- All writes through commons abstract services; subclass + `super`.
- Epoch-ms timestamps; `next_id()` bigint PKs + prefixed nanoid `public_id`.
- Admin/typed inputs use select/date — never free-text for enums/dates/refs (TD-3).
- No new npm dependencies. Run from `apps/web`; tests `pnpm --filter web test <path>`, typecheck `pnpm --filter web exec tsc --noEmit`.
- Known pre-existing failing test to ignore: `db/__tests__/next-id.test.ts` (snowflake monotonicity).
- Reuse existing `ds/` and `ui/` components; do not add new primitives.

## File Structure

- `apps/web/app/(dashboard)/dashboard/inquiries/inquiry-schema.ts` — widen with optional prefs + `subSourceKey`.
- `apps/web/app/(dashboard)/dashboard/inquiries/actions.ts` — widen `createInquiry`; add `logActivity`, `markLost`, `convertInquiryInline`.
- `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx` — dynamic sources, dependent sub-source, collapsible Interest section, live zone badge.
- `apps/web/lib/services/inquiries.service.ts` — `resolveZoneId` on create; `logActivity`; `markLost`; `listForPipeline` (owner + last-touch + next-action + overdue).
- `apps/web/app/(dashboard)/dashboard/inquiries/[id]/page.tsx` — composer + timeline + ConvertSheet wiring.
- `apps/web/app/(dashboard)/dashboard/inquiries/[id]/inquiry-controls.tsx` — `ActivityComposer`, `MarkLostDialog`, typed timeline render.
- `apps/web/app/(dashboard)/dashboard/inquiries/[id]/convert-sheet.tsx` — NEW drawer wrapping the converted-to-RHF order form.
- `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx` — migrate to RHF+zod (kept; rendered inside the drawer).
- `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order-schema.ts` — NEW zod schema for the order form.
- Delete `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/page.tsx` (route replaced by drawer); keep `order/actions.ts`.
- `apps/web/app/(dashboard)/dashboard/inquiries/inquiries-list.tsx` — enhanced shadcn `Table` + owner/overdue filters.
- `apps/web/app/(dashboard)/dashboard/inquiries/page.tsx` — pipeline query + sources/zones props.

---

### Task 1: Resolve zone + prefs on inquiry create

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts`
- Test: `apps/web/lib/services/__tests__/inquiries-prefs.service.test.ts` (create)

**Interfaces:**
- Consumes: `loadCatalogSnapshot` zones, `matchZone`.
- Produces: `create(values)` accepts optional `postalCode` and resolves `zoneId` from it (null when no match); prefs columns (`planInterest`, `mealSizeInterest`, `personsInterest`, `preferredStart`, `quotedPrice`) pass straight through to the row.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
// Mock db + catalog. Assert: create with postalCode "M4C 1A1" sets zoneId to the matching zone's id;
// create with an unmatched postal sets zoneId null; planInterest/quotedPrice pass through to super.create.
// Model the db/super mock on inquiries-source-owner.service.test.ts.
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test inquiries-prefs`
Expected: FAIL.

- [ ] **Step 3: Implement zone resolution**

Add import `import { loadCatalogSnapshot } from "@/lib/catalog/load";` and `import { matchZone } from "@/lib/catalog/postal";`. Add a private helper and call it in `create` after source resolution:

```ts
private async resolveZoneId(postalCode?: string): Promise<bigint | null> {
  if (!postalCode) return null;
  const { zones } = await loadCatalogSnapshot();
  const z = matchZone(postalCode, zones);
  if (!z) return null;
  return zones.find((x) => x.name === z.name)?.id ?? null;
}
```

In `create`, after `const currentOwner = ...`:

```ts
const zoneId = await this.resolveZoneId(rest.postalCode as string | undefined);
const inq = await super.create({
  ...rest,
  phone: parsedPhone.data,
  ...(parsedEmail ? { email: parsedEmail.data } : {}),
  sourceId,
  subSourceId,
  currentOwner,
  zoneId,
});
```

(`rest` already carries `planInterest`/`mealSizeInterest`/`personsInterest`/`postalCode`/`preferredStart`/`quotedPrice`/`notes` as column names — they map directly.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web test inquiries-prefs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/lib/services/__tests__/inquiries-prefs.service.test.ts
git commit -m "feat(inquiries): resolve zone + carry intake prefs on create"
```

---

### Task 2: Widen intake schema + action

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/inquiry-schema.ts`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/actions.ts:7-18`

**Interfaces:**
- Produces: `inquiryFormSchema` with optional `subSourceKey`, `planInterest`, `mealSizeInterest`, `personsInterest`, `postalCode`, `preferredStart`, `quotedPrice`; `createInquiry` forwards them.

- [ ] **Step 1: Replace the schema**

```ts
import { z } from "zod";

export const inquiryFormSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().optional(),
  sourceKey: z.string().min(1),
  subSourceKey: z.string().optional(),
  planInterest: z.string().optional(),
  mealSizeInterest: z.string().optional(),
  personsInterest: z.coerce.number().int().min(1).max(20).optional(),
  postalCode: z.string().optional(),
  preferredStart: z.string().optional(),
  quotedPrice: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
});
export type InquiryFormValues = z.infer<typeof inquiryFormSchema>;
```

- [ ] **Step 2: Widen the action**

In `actions.ts`, replace the `createInquiry` input type + call:

```ts
export async function createInquiry(input: {
  fullName: string;
  phone: string;
  email?: string;
  sourceKey: string;
  subSourceKey?: string;
  planInterest?: string;
  mealSizeInterest?: string;
  personsInterest?: number;
  postalCode?: string;
  preferredStart?: string;
  quotedPrice?: number;
  notes?: string;
}) {
  await requireStaff();
  const inq = await inquiriesService.create(input);
  revalidatePath("/dashboard/inquiries");
  return { publicId: inq.publicId };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries/inquiry-schema.ts apps/web/app/\(dashboard\)/dashboard/inquiries/actions.ts
git commit -m "feat(inquiries): widen intake schema + action with prefs"
```

---

### Task 3: Dynamic sources + dependent sub-source + Interest section + zone badge

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/page.tsx` (load sources/subsources/zones, pass as props)

**Interfaces:**
- Consumes: `sources: { key; label; subs: { key; label }[] }[]`, `zones: { name; postalPrefixes; slotWindow; active }[]` passed from the page.
- Produces: source `Select` (dynamic), sub-source `Select` (filtered to chosen source, hidden if none), collapsible Interest section, live zone badge via `matchZone`.

- [ ] **Step 1: Load sources + zones in the page**

In `page.tsx`, add to the `Promise.all` (import `leadSources`, `leadSubsources` already partly; add `deliveryZones`):

```ts
db.select({ id: leadSources.id, key: leadSources.key, label: leadSources.label, active: leadSources.active }).from(leadSources),
db.select({ sourceId: leadSubsources.sourceId, key: leadSubsources.key, label: leadSubsources.label, active: leadSubsources.active }).from(leadSubsources),
db.select({ name: deliveryZones.name, postalPrefixes: deliveryZones.postalPrefixes, slotWindow: deliveryZones.slotWindow, active: deliveryZones.active }).from(deliveryZones).where(eq(deliveryZones.active, true)),
```

Build a nested `sources` array (active sources, each with its active subs) and pass `sources={sources}` and `zones={zones}` into `<AddInquirySheet>`.

- [ ] **Step 2: Rewrite the sheet**

Replace the hardcoded `SOURCES` with props. Add a `watch` on `sourceKey` to filter subs, a collapsible Interest block, and a zone badge derived from `watch("postalCode")`:

```tsx
import { matchZone } from "@/lib/catalog/postal";
// ...add to props:
type Src = { key: string; label: string; subs: { key: string; label: string }[] };
type Zone = { name: string; postalPrefixes: string[]; slotWindow: string; active: boolean };
export function AddInquirySheet({ trigger, defaultCountry, sources, zones }: {
  trigger: React.ReactNode; defaultCountry: CountryCode; sources: Src[]; zones: Zone[];
}) {
  // form defaultValues: add subSourceKey:"", planInterest:"", postalCode:"", etc.
  const sourceKey = form.watch("sourceKey");
  const postal = form.watch("postalCode");
  const subs = sources.find((s) => s.key === sourceKey)?.subs ?? [];
  const zone = postal ? matchZone(postal, zones) : null;
```

- Source `Select` maps `sources`. Reset `subSourceKey` to `""` when `sourceKey` changes (in the source `onValueChange`).
- Render the sub-source `Select` only when `subs.length > 0`.
- Add a collapsible `<details className="...">` "Interest (optional)" containing: plan, meal size/diet, persons (`type=number`), postal (`Input`) with a zone hint, preferred start (`type=date`), quoted price (`type=number`). Use plain `Input`/`Select` bound via `form.register`/`FormField`.
- Below the postal field show: `{postal ? (zone ? <Badge>Zone: {zone.name}</Badge> : <span className="text-muted-foreground text-sm">Out of delivery area — waitlist</span>) : null}`.
- In `onSubmit`, forward the new fields (empty strings → `undefined`).

(Full component: keep the existing fullName/phone/email/notes fields unchanged; only swap the source block and add the Interest block + submit mapping.)

- [ ] **Step 3: Typecheck + manual check**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.
Manual: `pnpm --filter web dev`, open `/dashboard/inquiries`, click New inquiry, pick Facebook → sub-source appears; type a postal → zone badge updates.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries/new-inquiry-form.tsx apps/web/app/\(dashboard\)/dashboard/inquiries/page.tsx
git commit -m "feat(inquiries): dynamic source/sub-source + intake prefs + zone badge"
```

---

### Task 4: Activity service — typed touchpoints + mark lost

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts`
- Test: `apps/web/lib/services/__tests__/inquiries-activity.service.test.ts` (create)

**Interfaces:**
- Produces:
  - `logActivity(publicId, { type, outcome?, note?, nextFollowUpAt? })` where `type ∈ "call"|"whatsapp"|"email"|"note"` — records an activity row.
  - `markLost(publicId, reason, note?)` — sets `stage="lost"` + `lostReason`, logs a `stage_change` activity with the note.

- [ ] **Step 1: Write the failing tests**

```ts
// Assert: logActivity inserts an activity with the given type/outcome/nextFollowUpAt for the inquiry's id.
// Assert: markLost updates stage->lost AND lostReason, and logs a stage_change activity from prev stage.
// Assert: markLost on an already-converted inquiry throws ValidationError.
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test inquiries-activity`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add `LostReason` type and methods to `InquiriesService`:

```ts
type ActivityType = "call" | "whatsapp" | "email" | "note";
type LostReason = (typeof inquiries.lostReason.enumValues)[number];

async logActivity(publicId: string, input: { type: ActivityType; outcome?: string; note?: string; nextFollowUpAt?: number }) {
  const inq = await this.read(publicId);
  await inquiryActivitiesService.create({
    inquiryId: inq.id,
    type: input.type,
    note: input.note ?? null,
    outcome: input.outcome ?? null,
    nextFollowUpAt: input.nextFollowUpAt ?? null,
  });
}

async markLost(publicId: string, reason: LostReason, note?: string) {
  const current = await this.read(publicId);
  if (current.stage === "converted") throw new ValidationError("Converted inquiry cannot be marked lost");
  await this.update(publicId, { stage: "lost", lostReason: reason });
  await inquiryActivitiesService.create({
    inquiryId: current.id,
    type: "stage_change",
    fromStage: current.stage,
    toStage: "lost",
    note: note ?? null,
  });
}
```

Export `LostReason` and `ActivityType` types at the bottom (`export type { Stage as InquiryStage, ActivityType, LostReason };`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web test inquiries-activity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/lib/services/__tests__/inquiries-activity.service.test.ts
git commit -m "feat(inquiries): typed activity touchpoints + mark lost with reason"
```

---

### Task 5: Activity + lost server actions

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/actions.ts`

**Interfaces:**
- Produces: `logActivity(inquiryId, input)`, `markLost(inquiryId, reason, note?)` server actions, both `requireStaff` + revalidate the detail path.

- [ ] **Step 1: Add the actions**

```ts
import type { ActivityType, InquiryStage, LostReason } from "@/lib/services/inquiries.service";

export async function logActivity(inquiryId: string, input: { type: ActivityType; outcome?: string; note?: string; nextFollowUpAt?: number }) {
  await requireStaff();
  await inquiriesService.logActivity(inquiryId, input);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  revalidatePath("/dashboard/inquiries");
}

export async function markLost(inquiryId: string, reason: LostReason, note?: string) {
  await requireStaff();
  await inquiriesService.markLost(inquiryId, reason, note);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  revalidatePath("/dashboard/inquiries");
}
```

(Keep the existing `addNote` for back-compat or remove it once the composer replaces it — remove it and its `inquiry-controls` usage in Task 6.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries/actions.ts
git commit -m "feat(inquiries): logActivity + markLost server actions"
```

---

### Task 6: Activity composer + typed timeline + mark-lost dialog

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/inquiry-controls.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/page.tsx`

**Interfaces:**
- Consumes: `logActivity`, `markLost`, `setStage` actions.
- Produces: `ActivityComposer` (type select + outcome + note + optional next-follow-up date), `MarkLostDialog`, and a `describe`/icon map for the timeline.

- [ ] **Step 1: Build the controls**

Replace `NoteForm` with `ActivityComposer` and add `MarkLostDialog` in `inquiry-controls.tsx`. Composer fields: `type` Select (`call`/`whatsapp`/`email`/`note`), `outcome` Input, `note` textarea, `nextFollowUp` date Input (converted to epoch-ms via `new Date(value).getTime()` or `undefined`). On submit call `logActivity(inquiryId, { type, outcome, note, nextFollowUpAt })`, reset, `router.refresh()`.

`MarkLostDialog` uses `ui/dialog`: reason `Select` over the enum values `["price","out_of_zone","no_response","chose_competitor","not_ready","other"]` (labelled), optional note textarea, confirm → `markLost(inquiryId, reason, note)`.

- [ ] **Step 2: Render timeline + composer in the detail page**

In `[id]/page.tsx`, extend `describe` for the new types and add an icon map:

```tsx
import { PhoneIcon, MessageCircleIcon, MailIcon, StickyNoteIcon, ArrowRightIcon, CheckCircleIcon } from "lucide-react";

const ICON: Record<string, typeof PhoneIcon> = {
  call: PhoneIcon, whatsapp: MessageCircleIcon, email: MailIcon, note: StickyNoteIcon,
  stage_change: ArrowRightIcon, created: ArrowRightIcon, converted: CheckCircleIcon,
};

function describe(a: { type: string; note: string | null; outcome: string | null; fromStage: string | null; toStage: string | null }) {
  switch (a.type) {
    case "created": return "Inquiry created";
    case "converted": return "Converted to an order";
    case "stage_change": return `Stage: ${a.fromStage} → ${a.toStage}`;
    case "call": case "whatsapp": case "email": return `${a.type[0].toUpperCase()}${a.type.slice(1)}${a.outcome ? ` — ${a.outcome}` : ""}`;
    default: return a.note ?? "";
  }
}
```

Render each activity as an icon + `describe(a)` + a `↳ Next: <date>` line when `a.nextFollowUpAt` is set (`formatEpoch(a.nextFollowUpAt, { mode: "date" })`), with an "overdue" `Badge` if it is in the past and it is the most recent activity. Replace `<NoteForm>` with `<ActivityComposer inquiryId=... />` and add `<MarkLostDialog inquiryId=... />` beside the stage control (hide when already converted/lost).

- [ ] **Step 3: Typecheck + manual**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.
Manual: log a call with a next-follow-up date; confirm the timeline shows the icon + "↳ Next:" line; mark an inquiry lost with a reason.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries/\[id\]/inquiry-controls.tsx apps/web/app/\(dashboard\)/dashboard/inquiries/\[id\]/page.tsx
git commit -m "feat(inquiries): activity composer, typed timeline, mark-lost dialog"
```

---

### Task 7: Pipeline query — owner, last-touch, next-action, overdue

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts`
- Test: `apps/web/lib/services/__tests__/inquiries-pipeline.service.test.ts` (create)

**Interfaces:**
- Produces: `listForPipeline(): Promise<PipelineRow[]>` where
  `PipelineRow = { publicId, fullName, phone, source, stage, ownerName, lastTouchAt, nextFollowUpAt, overdue, createdAt }`.
  `nextFollowUpAt` = the max `next_follow_up_at` across the inquiry's activities; `lastTouchAt` = max activity `created_at`; `overdue` = `nextFollowUpAt != null && nextFollowUpAt < Date.now() && stage not in (converted, lost)`.

- [ ] **Step 1: Write the failing test**

```ts
// Assert the query maps rows: an inquiry whose latest activity nextFollowUpAt is in the past and stage="contacted"
// has overdue=true; a converted inquiry with a past nextFollowUpAt has overdue=false.
// (Compute overdue in JS from the aggregated nextFollowUpAt so it is unit-testable without a live DB:
//  expose a pure helper computeOverdue(stage, nextFollowUpAt, now) and test THAT directly.)
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test inquiries-pipeline`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add a pure helper (exported) + the query:

```ts
export function computeOverdue(stage: string, nextFollowUpAt: number | null, now: number): boolean {
  if (nextFollowUpAt == null) return false;
  if (stage === "converted" || stage === "lost") return false;
  return nextFollowUpAt < now;
}

async listForPipeline() {
  const agg = db
    .select({
      inquiryId: inquiryActivities.inquiryId,
      lastTouchAt: sql<number>`max(${inquiryActivities.createdAt})`.as("last_touch_at"),
      nextFollowUpAt: sql<number | null>`max(${inquiryActivities.nextFollowUpAt})`.as("next_follow_up_at"),
    })
    .from(inquiryActivities)
    .groupBy(inquiryActivities.inquiryId)
    .as("agg");

  const rows = await db
    .select({
      publicId: inquiries.publicId,
      fullName: inquiries.fullName,
      phone: inquiries.phone,
      source: leadSources.label,
      stage: inquiries.stage,
      ownerName: users.name,
      createdAt: inquiries.createdAt,
      lastTouchAt: agg.lastTouchAt,
      nextFollowUpAt: agg.nextFollowUpAt,
    })
    .from(inquiries)
    .innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
    .leftJoin(users, eq(inquiries.currentOwner, users.id))
    .leftJoin(agg, eq(agg.inquiryId, inquiries.id))
    .orderBy(desc(inquiries.createdAt))
    .limit(500);

  const now = Date.now();
  return rows.map((r) => ({ ...r, overdue: computeOverdue(r.stage, r.nextFollowUpAt, now) }));
}
```

Add `sql` to the `drizzle-orm` import.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web test inquiries-pipeline`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/lib/services/__tests__/inquiries-pipeline.service.test.ts
git commit -m "feat(inquiries): pipeline query with owner/last-touch/next-action/overdue"
```

---

### Task 8: Enhanced inquiry table

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/inquiries-list.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/page.tsx` (use `listForPipeline`, pass owners)

**Interfaces:**
- Consumes: `PipelineRow[]` from `listForPipeline`.
- Produces: a shadcn `Table` with columns name, owner, stage, source, last-touch, next-action (overdue badge), created; existing stage pills + search retained; add an "Overdue" pill and an owner `Select` filter.

- [ ] **Step 1: Swap the page to the pipeline query**

In `page.tsx`, replace the inline `rows` query with `inquiriesService.listForPipeline()`; keep `stageCounts`/`total`. Pass `rows` (now `PipelineRow[]`) to `<InquiriesList>`.

- [ ] **Step 2: Rebuild the list as a table**

Rewrite `inquiries-list.tsx` to render `ui/table` (`Table`, `TableHeader`, `TableHead`, `TableBody`, `TableRow`, `TableCell`). Row type becomes `PipelineRow`. Keep the `FilterBar` + stage `FilterPill`s + `SearchInput`; add an "Overdue" pill (`activeStage === "overdue"` filters `r.overdue`) and an owner `Select` (distinct `ownerName`s, "All owners" default). Each row: name links to detail, owner, `<StageBadge>`, source, `formatEpoch(lastTouchAt, {mode:"datetime"})` or "—", next-action cell = `nextFollowUpAt ? formatEpoch(..,{mode:"date"}) : "—"` with an `overdue` red `Badge` when `r.overdue`, created date. `formatEpoch` is a client-safe import from `@/lib/format/datetime`.

- [ ] **Step 3: Typecheck + manual**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.
Manual: table renders; Overdue pill filters; owner filter narrows.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries/inquiries-list.tsx apps/web/app/\(dashboard\)/dashboard/inquiries/page.tsx
git commit -m "feat(inquiries): enhanced pipeline table with owner/overdue filters"
```

---

### Task 9: Order form → RHF + zod

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order-schema.ts`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx`

**Interfaces:**
- Produces: `orderFormSchema` (zod) + an `OrderForm` driven by `useForm`, same `buildInput()`→`CreateOrderInput` shape, same live `previewPrice`, same `convertInquiry` submit. `prefill` prop seeds defaults.

- [ ] **Step 1: Add the schema**

```ts
import { z } from "zod";
export const orderFormSchema = z.object({
  planKey: z.string().min(1),
  mealSizeId: z.string().min(1),
  frequencyKey: z.enum(["5_day", "mwf"]),
  persons: z.coerce.number().int().min(1).max(5),
  mealSlots: z.array(z.string()).min(1),
  includeSaturday: z.boolean(),
  includeSunday: z.boolean(),
  durationWeeks: z.coerce.number().int().min(1),
  startDate: z.string().min(1, "Start date is required"),
  email: z.string().optional(),
  addressLine: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  postalCode: z.string().min(1, "Postal code is required"),
});
export type OrderFormValues = z.infer<typeof orderFormSchema>;
```

- [ ] **Step 2: Migrate `OrderForm` to RHF**

Replace the `useState` cluster with `const form = useForm<OrderFormValues>({ resolver: zodResolver(orderFormSchema), defaultValues: { ...prefill } })`. Bind each control via `form.watch`/`form.setValue` (Select/Switch/checkbox) or `form.register` (Inputs). `buildInput()` reads `form.getValues()`. Keep the `useEffect` price preview keyed on `form.watch()` of the pricing-relevant fields. Submit via `form.handleSubmit(async (v) => { try { await convertInquiry(inquiryId, buildInput(v)); } catch ... })`. Add a `prefill?: Partial<OrderFormValues>` prop merged into defaults. Keep the invoice aside unchanged.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries/\[id\]/order-schema.ts apps/web/app/\(dashboard\)/dashboard/inquiries/\[id\]/order/order-form.tsx
git commit -m "refactor(convert): order form on RHF + zod with prefill"
```

---

### Task 10: Inline convert drawer + dedup banner; remove /order route

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/convert-sheet.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/page.tsx`
- Modify: `apps/web/lib/services/customers.service.ts` (add `findExistingByContact`)
- Delete: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/page.tsx`
- Test: `apps/web/lib/services/__tests__/customers-dedup.service.test.ts` (create)

**Interfaces:**
- Consumes: `OrderForm` (RHF), `convertInquiry`/`previewPrice` actions, catalog + enabled slots (loaded in the detail page), inquiry prefs for prefill.
- Produces: `ConvertSheet` drawer; `findExistingByContact(phone, email?)` returning `{ publicId, fullName } | null`; dedup banner in the drawer.

- [ ] **Step 1: Dedup lookup (TDD)**

Add to `customers.service.ts`:

```ts
export async function findExistingByContact(phone: string, email?: string | null) {
  const conds = [eq(sql`lower(${users.phone})`, phone.toLowerCase())];
  if (email) conds.push(eq(sql`lower(${users.email})`, email.toLowerCase()));
  const [row] = await db
    .select({ publicId: users.publicId, name: users.name })
    .from(users)
    .where(and(eq(users.role, "user"), or(...conds)))
    .limit(1);
  return row ? { publicId: row.publicId, fullName: row.name ?? "Customer" } : null;
}
```

(Add `and` to the import.) Test: a `user`-role row with the same phone is found; no match → null; a staff row with the same phone is NOT returned.

Run: `pnpm --filter web test customers-dedup` → FAIL then PASS after implementing.

- [ ] **Step 2: Build the drawer**

`convert-sheet.tsx` (`"use client"`): a `Sheet` with the "Create order" trigger; on open, render `<OrderForm ... prefill={prefill} />` inside `SheetContent` (wide: `sm:max-w-2xl`). Show the dedup banner at the top when `existing` prop is non-null: `⚠ Existing customer? {existing.fullName} ` + a `Link` to `/dashboard/customers/{existing.publicId}`. Props: `inquiryId`, `contact`, `catalog`, `enabledSlots`, `prefill`, `existing`.

- [ ] **Step 3: Wire the detail page; drop the route**

In `[id]/page.tsx` load catalog + enabled slots + dedup (mirror `order/page.tsx`): `loadCatalogSnapshot()`, `mealSlotsService.enabledSlots()`, `findExistingByContact(inq.phone, inq.email)`. Build `prefill` from inquiry prefs (`planInterest`→planKey, `mealSizeInterest`→mealSizeId, `personsInterest`→persons, `preferredStart`→startDate, `postalCode`). Replace the `Link … /order` button with `<ConvertSheet … />` (hidden when converted). Delete `order/page.tsx`.

- [ ] **Step 4: Typecheck + full test run + manual**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.
Run: `pnpm --filter web test` → all green except the known `next-id` flake.
Manual: open an inquiry with intake prefs → Convert drawer opens prefilled; postal zone shows; dedup banner appears when phone matches an existing customer; submit converts + redirects.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(convert): inline drawer with prefill + dedup banner; remove /order route"
```

---

## Self-Review

**Spec coverage (Phase 1 build-order rows):**
- Optional intake prefs + live zone badge → Tasks 1, 2, 3 ✓
- Dependent source/sub-source selects → Task 3 ✓
- Typed touchpoints + next-action + overdue → Tasks 4, 6, 7 ✓
- Mark-lost dialog (reason + note) → Tasks 4, 6 ✓
- Conversion inline drawer: RHF+zod, prefill, zone match, dedup → Tasks 9, 10 ✓
- Simple owner (creator + system fallback) → landed in Phase 0; surfaced in the table (Task 7/8) ✓
- Enhanced table (filters, owner, last-touch/next-action) → Tasks 7, 8 ✓

**Deferred (correctly not here):** rules engine + source admin CRUD (Phase 2), sorting (Phase 3).

**Placeholder scan:** UI Tasks 3/6/8/9/10 give component structure + the exact new/changed code rather than re-printing every unchanged field of large existing components; each names the precise file, the controls to bind, and the data shapes. Logic-bearing pieces (zone resolve, overdue, dedup, schemas) carry full code + tests. Acceptable — no "TODO"/"add validation"/"similar to" placeholders.

**Type consistency:** `PipelineRow` (Task 7) consumed by Task 8; `ActivityType`/`LostReason` defined in Task 4, used in Tasks 5/6; `OrderFormValues`/`prefill` defined in Task 9, used in Task 10; `findExistingByContact` returns `{ publicId, fullName }` used identically in Task 10 banner.

---

## Execution Handoff

Phase 1 executes via an **ultracode workflow**, same shape as Phase 0: sequential agents on the shared tree (Tasks 1→10 build on each other — service before actions before UI), with a `tsc`+`vitest` verify gate (ignoring the `next-id` flake) and a final adversarial review against this plan + the spec. UI tasks run `dev`-server manual checks where noted; the workflow agents perform typecheck + unit tests and report manual-check steps for the user to spot-confirm.
