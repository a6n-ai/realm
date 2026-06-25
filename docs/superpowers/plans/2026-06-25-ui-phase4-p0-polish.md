# UI Phase 4 (P0) — Brand + Feel-Better + Form/Loading Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the P0 slice from the UI audit — give the dashboard a brand identity, align all numbers, and close the worst UX gaps (validation feedback, loading skeletons, row affordance, empty-state guidance).

**Architecture:** Theme tokens get a single tunable `--brand` hue (light + dark); a `tabular-nums` utility lands on all data; forms wire `FormMessage` + required markers + a disabled-submit reason; list/overview pages get `loading.tsx` skeletons; tables get hover affordance; `EmptyState` gains an `action` slot.

**Tech Stack:** Next.js (non-stock — read `node_modules/next/dist/docs/`), Tailwind v4 `@theme`, shadcn, RHF/zod, Vitest.

## Global Constraints

- Solid color only — NO gradient/clip/animation on text (project rule). OKLCH; tint neutrals toward `--brand`.
- Reuse existing `ds`/`ui` components; no new deps. Ignore the `next-id` flake. No DB work.
- Keep changes additive/low-risk; preserve all current behavior and tests green.
- `--brand` is one tunable hue — pick saffron-orange (hue ~60) by default; the values below are retunable in one place.

## File Structure

- `apps/web/app/globals.css` — `--brand*` tokens, neutral tint, remove dead `.gradient-text`, `.nums`/`text-balance` utilities.
- `apps/web/components/ds/{stat-card,list-row,empty-state}.tsx` — tabular-nums + EmptyState `action`.
- `apps/web/components/ds/data-cell.tsx` — NEW tiny `<NumCell>` for right-aligned tabular numbers (optional helper).
- Table list components (`inquiries-list`, `orders-list`, `customers-list`) — number cells + row hover.
- `apps/web/app/(dashboard)/dashboard/**/loading.tsx` — NEW skeletons for inquiries/orders/customers/overview.
- `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx` + `new-inquiry-form.tsx` — validation polish.

---

### Task 1: Brand theme tokens + cleanup

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `--brand` hue drives `--primary`, `--ring`, sidebar-primary, and selection; neutrals tinted toward it; `.gradient-text` removed; `.nums` + `.text-balance`/`.text-pretty` utilities added.

- [ ] **Step 1: Brand tokens (light)**

In `:root`, set a brand hue and route primary/ring through it; tint neutrals (chroma 0.004 toward hue 60):

```css
  /* Brand: saffron-orange. Retune by changing the hue (60) in one place. */
  --brand: oklch(0.66 0.16 60);
  --brand-foreground: oklch(0.985 0.01 60);
  --primary: oklch(0.66 0.16 60);
  --primary-foreground: oklch(0.985 0.01 60);
  --ring: oklch(0.66 0.13 60);
  --background: oklch(0.995 0.002 60);
  --foreground: oklch(0.16 0.006 60);
  --muted: oklch(0.97 0.004 60);
  --muted-foreground: oklch(0.55 0.012 60);
  --border: oklch(0.92 0.004 60);
  --input: oklch(0.92 0.004 60);
  --sidebar: oklch(0.985 0.003 60);
  --sidebar-primary: oklch(0.66 0.16 60);
```

(Keep `--secondary`/`--accent` near-neutral but tinted: `oklch(0.97 0.004 60)`. Leave `--ok/--warn/--bad` as-is — they must stay distinct from brand.)

- [ ] **Step 2: Brand tokens (dark)**

In `.dark`, brand stays the identity color but lighten for contrast; tint dark neutrals:

```css
  --brand: oklch(0.72 0.15 60);
  --brand-foreground: oklch(0.18 0.01 60);
  --primary: oklch(0.72 0.15 60);
  --primary-foreground: oklch(0.18 0.01 60);
  --ring: oklch(0.62 0.10 60);
  --background: oklch(0.16 0.004 60);
  --foreground: oklch(0.985 0.003 60);
  --muted: oklch(0.27 0.006 60);
  --muted-foreground: oklch(0.71 0.01 60);
  --sidebar-primary: oklch(0.72 0.15 60);
```

- [ ] **Step 3: Cleanup + utilities**

- Delete the `.gradient-text` class and drop it from the `prefers-reduced-motion` selector list.
- Add to `@layer utilities`:

```css
  .nums { font-variant-numeric: tabular-nums; }
  .text-balance { text-wrap: balance; }
  .text-pretty { text-wrap: pretty; }
```

- [ ] **Step 4: Typecheck/build sanity + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS (CSS-only, but verify nothing referenced `gradient-text` in TSX — `rg gradient-text apps/web` returns nothing).
Manual: dashboard shows saffron primary buttons / active nav; dark mode legible.

```bash
git add apps/web/app/globals.css
git commit -m "feat(theme): brand saffron hue, tinted neutrals, tabular/balance utilities; drop dead gradient-text"
```

---

### Task 2: tabular-nums on all data

**Files:**
- Modify: `apps/web/components/ds/stat-card.tsx`, `apps/web/components/ds/filter-pill.tsx` (count), `apps/web/components/ds/order-status-badge.tsx` (n/a if no number)
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/inquiries-list.tsx`, `orders/orders-list.tsx`, `customers/customers-list.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx` (invoice)

**Interfaces:**
- Produces: every rendered number (stat values, filter counts, money, totals, dates, order counts) carries `.nums`; money/numeric table columns right-aligned.

- [ ] **Step 1: Apply `.nums`**

- `stat-card.tsx`: add `nums` to the value element.
- `filter-pill.tsx`: add `nums` to the count badge.
- Table money/number/date cells (`orders` Total/Start/Created, `customers` Orders, `inquiries` Last touch/Next action/Created): wrap value in `<span className="nums">` and add `text-right`/`tabular` to the `TableCell` + matching header `className="text-right"`.
- `order-form.tsx` invoice: add `nums` to each amount + the total.

- [ ] **Step 2: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. Manual: totals/dates align in columns; stat counters don't jitter.

```bash
git add apps/web/components/ds apps/web/app/\(dashboard\)/dashboard
git commit -m "feat(ui): tabular-nums + right-align on all numeric/money/date data"
```

---

### Task 3: Form validation polish

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx`

**Interfaces:**
- Produces: required-field `*` markers; `FormMessage` under every validated field; a disabled-submit reason line listing missing required fields.

- [ ] **Step 1: Required markers + messages (order-form, RHF)**

For each required field (`plan`, `mealSize`, `frequency`, `persons`, `duration`, `startDate`, `addressLine`, `city`, `postalCode`), wrap in `FormField`/`FormItem` with `<FormLabel>… <span className="text-destructive">*</span></FormLabel>` and a `<FormMessage />`. (The RHF migration from Phase 1 already provides `form`; bind via `FormField` where still using raw `register`.)

- [ ] **Step 2: Disabled-submit reason**

Above the submit button, compute and render the blocking list:

```tsx
const missing = [
  !form.watch("startDate") && "start date",
  !form.watch("addressLine") && "address",
  !form.watch("city") && "city",
  !form.watch("postalCode") && "postal code",
].filter(Boolean) as string[];
// ...
{missing.length > 0 && (
  <p className="text-muted-foreground text-xs">Missing: {missing.join(", ")}</p>
)}
```

- [ ] **Step 3: Intake form `*` markers**

In `new-inquiry-form.tsx`, add the `*` span to Full name + Phone + Source labels (the required ones); optional fields keep the muted "(optional)" hint already present.

- [ ] **Step 4: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. Manual: blank required field shows inline error on submit; submit hint lists what's missing.

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries
git commit -m "feat(forms): required markers, inline validation, disabled-submit reason"
```

---

### Task 4: Skeleton loading states

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/loading.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/orders/loading.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/customers/loading.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/loading.tsx` (overview)

**Interfaces:**
- Produces: route-level `loading.tsx` rendering `ui/skeleton` placeholders matching each page's shape (Next streams them during the server fetch).

- [ ] **Step 1: List skeleton (shared shape)**

Each list `loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { ClipboardListIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={ClipboardListIcon} title="Loading…" />
      <SectionCard title=" ">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </SectionCard>
    </PageShell>
  );
}
```

(Swap the icon per page; overview `loading.tsx` renders 3 `Skeleton className="h-24"` stat tiles in a `sm:grid-cols-3` grid.)

- [ ] **Step 2: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. Manual: throttle network → skeletons stream before data.

```bash
git add apps/web/app/\(dashboard\)/dashboard
git commit -m "feat(ui): route-level skeleton loading states for list + overview pages"
```

---

### Task 5: Table row affordance

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/inquiries-list.tsx`, `orders/orders-list.tsx`, `customers/customers-list.tsx`

**Interfaces:**
- Produces: clickable rows signal interactivity — `cursor-pointer` on the row, `group` + name-link `group-hover:underline`, and a trailing `ChevronRightIcon` that fades in on row hover.

- [ ] **Step 1: Add affordance**

On each linked `TableRow`: `className="group cursor-pointer"`. Make the name cell link `group-hover:underline`. Add a final `TableCell` with `<ChevronRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />`. (Keep the existing `hover:bg-muted/50` from `ui/table`.)

- [ ] **Step 2: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. Manual: hovering a row underlines the name + reveals the chevron; cursor is a pointer.

```bash
git add apps/web/app/\(dashboard\)/dashboard
git commit -m "feat(ui): clickable-row affordance (hover underline + chevron)"
```

---

### Task 6: EmptyState action slot

**Files:**
- Modify: `apps/web/components/ds/empty-state.tsx`
- Modify: callers in `inquiries-list.tsx`, `orders-list.tsx`, `customers-list.tsx`

**Interfaces:**
- Produces: `EmptyState` accepts `action?: React.ReactNode`, rendered under the message; filtered-empty states pass a "Clear filters" button, base-empty states pass the page's primary CTA.

- [ ] **Step 1: Add the prop**

In `empty-state.tsx`, add `action?: React.ReactNode` to props and render `{action ? <div className="mt-3">{action}</div> : null}` under the message.

- [ ] **Step 2: Wire callers**

In each list, when the empty is due to active filters/search, pass `action={<Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}` (reset local filter state); for the truly-empty case pass the relevant CTA (e.g. inquiries → the New-inquiry trigger).

- [ ] **Step 3: Typecheck + full test run + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. `pnpm --filter web test` → green except `next-id` flake.

```bash
git add apps/web/components/ds/empty-state.tsx apps/web/app/\(dashboard\)/dashboard
git commit -m "feat(ui): EmptyState action slot (clear-filters / create CTAs)"
```

---

## Self-Review

**Coverage:** P0 items 1–7 from the audit → Tasks 1 (brand), 2 (tabular-nums), 3 (validation + submit reason), 4 (skeletons), 5 (row affordance), 6 (empty-state action). Sorting was Phase 3. P1/P2 (fieldset grouping, drawer footer, focus rings, error boundary, help) deferred to a later phase.

**Placeholder scan:** theme values, utilities, skeleton, empty-state prop, and the submit-reason snippet are concrete; the per-cell `.nums`/affordance edits enumerate exact components/columns. No "TODO"/"add polish".

**Type consistency:** `EmptyState` `action?: React.ReactNode` used identically by all three callers; `.nums`/`.text-balance` are CSS utilities (no TS surface); brand tokens are CSS vars consumed by existing `--color-*` mappings already in `@theme inline`.

**Brand caveat:** `--brand` hue 60 (saffron-orange) is a tunable default chosen to stay distinct from `--ok/--warn/--bad`; change the hue in `:root`/`.dark` to retheme.

---

## Execution Handoff

Executes via an **ultracode workflow**, same shape as prior phases: sequential agents (theme → tabular-nums → validation → skeletons → row affordance → empty-state), `tsc`+`vitest` verify gate (ignore `next-id`), adversarial review against this plan + the audit doc. No DB work; UI tasks report manual visual checks.
