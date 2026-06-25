# UI Phase 6 (P2) — Filter Persistence, Inline Help, Undo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the high-value P2 items — persist list filters in the URL (shareable, survives refresh, back-button correct), add inline help for domain concepts, and undo on stage change. Spacing-rhythm (audit item 14) is intentionally deferred (subjective restyle, low value).

**Architecture:** A small `useUrlState` hook syncs each list's filter to `searchParams` via `router.replace` (no history spam), keeping the existing client-side filtering. Tooltips use the already-mounted `ui/tooltip` (`TooltipProvider` is in `app/layout.tsx`). Stage-change undo uses `sonner` (`<Toaster/>` already mounted) by returning the previous stage from the server action.

**Tech Stack:** Next.js (non-stock — read `node_modules/next/dist/docs/`), `next/navigation`, sonner, shadcn tooltip, Vitest. No new deps (sonner + tooltip already installed).

## Global Constraints

- No new npm dependencies. Reuse `ui/tooltip` + `ui/sonner`. Solid color only on text.
- `tsc --noEmit` green after each task; preserve existing behavior + tests. No DB work. Ignore the `next-id` flake.
- Use `router.replace` (not `push`) for filter writes — don't grow the history stack on every keystroke/click.

## File Structure

- `apps/web/lib/list/use-url-state.ts` — NEW client hook + pure `mergeParam` helper.
- `apps/web/app/(dashboard)/dashboard/inquiries/inquiries-list.tsx`, `orders/orders-list.tsx`, `customers/customers-list.tsx` — filters via `useUrlState`.
- `apps/web/app/(dashboard)/dashboard/inquiries/[id]/inquiry-controls.tsx` — stage tooltip + undo toast.
- `apps/web/app/(dashboard)/dashboard/inquiries/actions.ts` — `setStage` returns previous stage.
- `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx` — sub-source help tooltip.

---

### Task 1: `useUrlState` hook

**Files:**
- Create: `apps/web/lib/list/use-url-state.ts`
- Test: `apps/web/lib/list/__tests__/use-url-state.test.ts` (create — tests the pure helper)

**Interfaces:**
- Produces:
  - `mergeParam(current: string, key: string, value: string, fallback: string): string` — pure: returns a new query string with `key` set, or removed when `value === fallback || value === ""`.
  - `useUrlState(key: string, fallback: string): [string, (v: string) => void]` — reads from `searchParams`, writes via `router.replace(..., { scroll: false })`.

- [ ] **Step 1: Failing test for `mergeParam`**

```ts
import { describe, it, expect } from "vitest";
import { mergeParam } from "../use-url-state";

describe("mergeParam", () => {
  it("sets a value", () => {
    expect(mergeParam("", "stage", "new", "all")).toBe("stage=new");
  });
  it("removes the key when value equals fallback", () => {
    expect(mergeParam("stage=new&q=x", "stage", "all", "all")).toBe("q=x");
  });
  it("removes the key when value is empty", () => {
    expect(mergeParam("q=hi", "q", "", "")).toBe("");
  });
  it("preserves other params (e.g. sort)", () => {
    const out = mergeParam("sort=name&dir=asc", "owner", "Asha", "ALL");
    expect(new URLSearchParams(out).get("sort")).toBe("name");
    expect(new URLSearchParams(out).get("owner")).toBe("Asha");
  });
});
```

Run: `pnpm --filter web test use-url-state` → FAIL.

- [ ] **Step 2: Implement**

```ts
"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function mergeParam(current: string, key: string, value: string, fallback: string): string {
  const sp = new URLSearchParams(current);
  if (value === fallback || value === "") sp.delete(key);
  else sp.set(key, value);
  return sp.toString();
}

export function useUrlState(key: string, fallback: string): [string, (v: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = useCallback(
    (v: string) => {
      const qs = mergeParam(params.toString(), key, v, fallback);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [key, fallback, params, pathname, router],
  );
  return [value, set];
}
```

Run: `pnpm --filter web test use-url-state` → PASS. `tsc --noEmit` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/list/use-url-state.ts apps/web/lib/list/__tests__/use-url-state.test.ts
git commit -m "feat(list): useUrlState hook for URL-persisted filters"
```

---

### Task 2: Persist list filters in the URL

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/inquiries-list.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/orders/orders-list.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/customers/customers-list.tsx`

**Interfaces:**
- Produces: each list's filter state comes from `useUrlState` (keys: inquiries `q`/`stage`/`owner`, orders `q`/`status`, customers `q`); `clearFilters` resets each to its fallback; client-side filtering logic unchanged.

- [ ] **Step 1: Swap `useState` → `useUrlState`**

In `inquiries-list.tsx`: replace the three `useState` calls with
`const [search, setSearch] = useUrlState("q", "");`
`const [activeStage, setActiveStage] = useUrlState("stage", "all");`
`const [owner, setOwner] = useUrlState("owner", ALL_OWNERS);`
`clearFilters` calls the three setters with their fallbacks. (`sort` is already a separate URL param — `useUrlState` preserves it via `mergeParam`.)

Same pattern for `orders-list.tsx` (`q`, `status`) and `customers-list.tsx` (`q`).

- [ ] **Step 2: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. Manual: set a stage + owner filter, refresh → filters persist; copy the URL to a new tab → same view; sort still works alongside filters.

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries/inquiries-list.tsx apps/web/app/\(dashboard\)/dashboard/orders/orders-list.tsx apps/web/app/\(dashboard\)/dashboard/customers/customers-list.tsx
git commit -m "feat(list): persist filters in URL (shareable, survives refresh)"
```

---

### Task 3: Undo on stage change

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/actions.ts` (`setStage` returns prior stage)
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/inquiry-controls.tsx` (`StageControl` toast + undo)

**Interfaces:**
- Produces: `setStage(inquiryId, toStage)` returns `{ previous: InquiryStage }`; `StageControl` fires a sonner toast `Stage → <X>` with an **Undo** action that calls `setStage(inquiryId, previous)`.

- [ ] **Step 1: Return the prior stage from the action**

`changeStage` already reads `current.stage`. In `actions.ts` `setStage`, capture and return it:

```ts
export async function setStage(inquiryId: string, toStage: InquiryStage): Promise<{ previous: InquiryStage }> {
  await requireStaff();
  const prev = await inquiriesService.changeStage(inquiryId, toStage);
  revalidatePath("/dashboard/inquiries");
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  return { previous: prev.stage as InquiryStage };
}
```

(`changeStage` returns the row *before* update? Verify: it returns `updated`. If it returns the updated row, instead read the previous stage before calling — capture `current.stage`. Adjust `changeStage` to return `{ previous }` or read it in the action via `inquiriesService.read` first. Implement whichever keeps one round-trip: simplest is to have `changeStage` return the prior stage.)

- [ ] **Step 2: Toast + undo in `StageControl`**

In `inquiry-controls.tsx`, import `toast` from `sonner`. On change:

```tsx
onValueChange={(v) => start(async () => {
  const { previous } = await setStage(inquiryId, v as InquiryStage);
  router.refresh();
  if (previous !== v) {
    toast(`Stage → ${v}`, {
      action: { label: "Undo", onClick: () => start(async () => { await setStage(inquiryId, previous); router.refresh(); }) },
    });
  }
})}
```

- [ ] **Step 3: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. Manual: change a stage → toast appears; click Undo → reverts.

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries/actions.ts apps/web/app/\(dashboard\)/dashboard/inquiries/\[id\]/inquiry-controls.tsx
git commit -m "feat(inquiries): undo on stage change via toast"
```

---

### Task 4: Inline help tooltips

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/inquiry-controls.tsx` (stage help)
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx` (sub-source help)

**Interfaces:**
- Produces: a `?`/info affordance with a `Tooltip` explaining "Stage" (pipeline position) next to `StageControl`, and one explaining "Sub-source" next to that field's label.

- [ ] **Step 1: Stage tooltip**

In `inquiry-controls.tsx`, import `Tooltip, TooltipContent, TooltipTrigger` from `@/components/ui/tooltip` and `HelpCircleIcon` from lucide. Next to the stage `Select`, render:

```tsx
<Tooltip>
  <TooltipTrigger asChild><button type="button" aria-label="What is a stage?"><HelpCircleIcon className="text-muted-foreground size-4" /></button></TooltipTrigger>
  <TooltipContent>Where this lead sits in the pipeline: new → contacted → follow-up → converted / lost.</TooltipContent>
</Tooltip>
```

- [ ] **Step 2: Sub-source tooltip**

In `new-inquiry-form.tsx`, on the Sub-source `FormLabel`, add the same `Tooltip` pattern with content: "A finer breakdown of the source, e.g. Facebook → Facebook Ads."

- [ ] **Step 3: Typecheck + full test run + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS. `pnpm --filter web test` → green except `next-id` flake.

```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries
git commit -m "feat(ui): inline help tooltips for stage + sub-source"
```

---

## Self-Review

**Coverage:** P2 items — filter persistence (Tasks 1–2, audit #15), undo on stage change (Task 3, #17), inline help (Task 4, #16). Spacing rhythm (#14) deliberately deferred. Sort persistence already shipped in Phase 3.

**Placeholder scan:** hook + helper carry full code + tests; persistence swap enumerates exact keys/fallbacks per list; undo + tooltip snippets are concrete. The one conditional (`changeStage` return shape) is called out with the exact adjustment to make. No "TODO".

**Type consistency:** `useUrlState`/`mergeParam` signatures consumed identically across the three lists; `setStage` return `{ previous: InquiryStage }` matches the toast undo call; `InquiryStage` is the existing exported type.

**No-dep check:** sonner + ui/tooltip already installed and mounted in `app/layout.tsx`; no additions.

---

## Execution Handoff

Executes via an **ultracode workflow**, same shape as prior phases: sequential agents (hook → persistence → undo → tooltips), `tsc`+`vitest` verify gate (ignore `next-id`), adversarial review against this plan + the audit (no new deps; `router.replace` not `push`). UI tasks report manual checks.
