# UI Phase 5 (P1) — Form Structure, Drawer Footer, Focus, Boundaries

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the P1 slice from the UI audit — group the long conversion form, give the convert drawer a sticky running total, standardize control vocabulary, add focus-visible rings, balance headings, and add error boundaries.

**Architecture:** Order form splits into three titled fieldsets with a sticky total/submit footer (works in the drawer and standalone). Raw `<textarea>` swap to the existing `Textarea`; native meal-slot checkboxes get brand styling + focus rings (no new dep — radix checkbox is not installed). `ds` primitives gain focus-visible rings and `text-wrap` balance. Route `error.tsx` boundaries catch failures with retry.

**Tech Stack:** Next.js (non-stock — read `node_modules/next/dist/docs/`), Tailwind v4, shadcn, RHF, Vitest.

## Global Constraints

- No new npm dependencies (radix checkbox absent → style the native input; do NOT add radix). Solid color only on text.
- Reuse `ds`/`ui` components. `tsc --noEmit` green after each task. No DB work. Ignore the `next-id` flake.
- Preserve all current form behavior + tests.

## File Structure

- `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx` — fieldset grouping, native-checkbox styling, sticky footer.
- `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx`, `[id]/inquiry-controls.tsx`, `apps/web/app/(marketing)/contact/contact-form.tsx` — raw `<textarea>` → `Textarea`.
- `apps/web/components/ds/filter-pill.tsx`, `search-input.tsx`, `page-header.tsx`, `section-card.tsx` — focus rings + `text-balance`.
- `apps/web/app/error.tsx`, `apps/web/app/(dashboard)/dashboard/error.tsx` — NEW boundaries.

---

### Task 1: Standardize text controls + brand checkboxes

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/inquiry-controls.tsx`
- Modify: `apps/web/app/(marketing)/contact/contact-form.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx` (meal-slot checkbox)

**Interfaces:**
- Produces: every multi-line input uses `ui/textarea` `Textarea`; native meal-slot checkboxes use `accent-[var(--brand)] size-4 rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

- [ ] **Step 1: Swap raw textareas**

In each file, replace the hand-rolled `<textarea className="border-input …">` with `import { Textarea } from "@/components/ui/textarea"` and `<Textarea {...} />` (keep the same `value`/`onChange`/`register`/placeholder bindings). The bespoke class string is dropped — `Textarea` already carries the matching styles.

- [ ] **Step 2: Brand the meal-slot checkboxes**

In `order-form.tsx`, the meal-slot loop's native `<input type="checkbox">` gets `className="accent-[var(--brand)] size-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"`. (No radix dep.)

- [ ] **Step 3: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. Manual: note/outcome/contact textareas look identical to inputs; checkboxes are saffron when checked and show a focus ring on tab.

```bash
git add apps/web/app
git commit -m "refactor(ui): Textarea component everywhere + brand-styled meal-slot checkboxes"
```

---

### Task 2: Group the conversion form into fieldsets

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx`

**Interfaces:**
- Produces: three labelled sections — **Plan & Schedule** (plan, meal size, frequency, persons, duration, start date), **Meal Options** (slots, Saturday, Sunday), **Delivery** (email, address, city, postal) — each a `<fieldset>` with a `<legend>`.

- [ ] **Step 1: Wrap the existing groups**

Without changing any field logic, wrap the three existing field clusters in:

```tsx
<fieldset className="space-y-3">
  <legend className="text-sm font-medium text-foreground mb-1">Plan & Schedule</legend>
  {/* existing plan/size/frequency/persons/duration/start grid */}
</fieldset>
```

Repeat for "Meal Options" (the meal-slots block + the Sat/Sun switches) and "Delivery" (the email/address/city/postal grid). Keep the left column / invoice-aside layout (`md:grid-cols-[1fr_280px]`).

- [ ] **Step 2: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. Manual: the long form now reads as three labelled sections.

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries/\[id\]/order/order-form.tsx
git commit -m "feat(forms): group conversion form into Plan/Meal/Delivery fieldsets"
```

---

### Task 3: Sticky total + submit footer in the order form

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx`

**Interfaces:**
- Produces: the submit button + a live total move into a `sticky bottom-0` bar so the running total is always visible while scrolling the drawer; the existing invoice-aside breakdown stays.

- [ ] **Step 1: Add the sticky footer**

At the end of the left column (or spanning the form), add:

```tsx
<div className="sticky bottom-0 -mx-4 mt-2 flex items-center justify-between gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
  <div className="text-sm">
    <span className="text-muted-foreground">Total </span>
    <span className="nums font-medium">{preview ? `$${preview.total.toFixed(2)}` : "—"}</span>
    {preview ? <span className="text-muted-foreground nums"> · {preview.tiffinCount} tiffins</span> : null}
  </div>
  <div className="flex flex-col items-end gap-1">
    {missing.length > 0 && <p className="text-muted-foreground text-xs">Missing: {missing.join(", ")}</p>}
    <Button type="submit" disabled={pending || missing.length > 0}>Create order &amp; convert</Button>
  </div>
</div>
```

Move the existing submit button into this bar (remove the old inline one + its duplicate "Missing" line from Phase 4 so the reason shows once, in the footer).

- [ ] **Step 2: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. Manual: open the Convert drawer, scroll — total + submit stay pinned at the bottom; total updates live.

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries/\[id\]/order/order-form.tsx
git commit -m "feat(convert): sticky running-total + submit footer"
```

---

### Task 4: Focus-visible rings on ds controls

**Files:**
- Modify: `apps/web/components/ds/filter-pill.tsx`
- Modify: `apps/web/components/ds/search-input.tsx`

**Interfaces:**
- Produces: `FilterPill` and the `SearchInput` clear button show a visible keyboard-focus ring.

- [ ] **Step 1: Add the rings**

`filter-pill.tsx`: append to the button className `"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"`.
`search-input.tsx`: append the same to the clear `<button>` className (it currently has only color states).

- [ ] **Step 2: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. Manual: Tab to a filter pill / the clear button → a saffron focus ring appears.

```bash
git add apps/web/components/ds/filter-pill.tsx apps/web/components/ds/search-input.tsx
git commit -m "fix(a11y): focus-visible rings on FilterPill + SearchInput clear"
```

---

### Task 5: Balance headings

**Files:**
- Modify: `apps/web/components/ds/page-header.tsx`
- Modify: `apps/web/components/ds/section-card.tsx`

**Interfaces:**
- Produces: the `PageHeader` `<h1>` and `SectionCard` title use `text-balance`; long body/prose uses `text-pretty` where present.

- [ ] **Step 1: Apply utilities**

`page-header.tsx`: add `text-balance` to the `<h1>` className. `section-card.tsx`: add `text-balance` to its title element. If either renders a `subtitle`/description paragraph, add `text-pretty`.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.

```bash
git add apps/web/components/ds/page-header.tsx apps/web/components/ds/section-card.tsx
git commit -m "feat(ui): balance headings (text-wrap) in PageHeader + SectionCard"
```

---

### Task 6: Error boundaries

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/error.tsx`
- Create: `apps/web/app/error.tsx`

**Interfaces:**
- Produces: client `error.tsx` boundaries with a clear message + a Retry (`reset`) button; the dashboard one renders inside `PageShell`.

- [ ] **Step 1: Dashboard boundary**

```tsx
"use client";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageShell>
      <PageHeader icon={AlertTriangleIcon} title="Something went wrong" />
      <SectionCard title="Error">
        <p className="text-muted-foreground text-sm">This page failed to load. Try again, or head back to the dashboard.</p>
        {error.digest ? <p className="text-muted-foreground mt-1 text-xs">Ref: {error.digest}</p> : null}
        <div className="mt-3 flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild><a href="/dashboard">Back to dashboard</a></Button>
        </div>
      </SectionCard>
    </PageShell>
  );
}
```

- [ ] **Step 2: Root boundary**

`app/error.tsx`: a minimal `"use client"` boundary (no dashboard chrome) with the same message + Retry, centered.

- [ ] **Step 3: Typecheck + full test run + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. `pnpm --filter web test` → green except `next-id` flake.

```bash
git add apps/web/app/error.tsx apps/web/app/\(dashboard\)/dashboard/error.tsx
git commit -m "feat(ui): route error boundaries with retry"
```

---

## Self-Review

**Coverage:** P1 backlog items — form grouping + control vocabulary (Tasks 1–2), drawer sticky total (Task 3), focus rings (Task 4), balanced headings (Task 5), error boundary (Task 6). Item 12 (remove `gradient-text`) shipped in Phase 4. P2 (spacing rhythm, persistence, inline help, undo) deferred.

**Placeholder scan:** sticky footer, focus rings, error boundaries, and the checkbox/textarea swaps are concrete code; the fieldset grouping enumerates exactly which existing clusters get wrapped. No "TODO".

**Type/dep consistency:** no new deps (native checkbox styled, existing `Textarea` reused). `missing`/`preview`/`pending` referenced in Task 3 already exist in the Phase-4 order-form. Error boundary props match Next's `{ error, reset }` contract.

---

## Execution Handoff

Executes via an **ultracode workflow**, same shape as prior phases: sequential agents (controls → grouping → sticky footer → focus rings → headings → boundaries), `tsc`+`vitest` verify gate (ignore `next-id`), adversarial review against this plan + the audit (no new deps, no text gradients). UI tasks report manual visual checks.
