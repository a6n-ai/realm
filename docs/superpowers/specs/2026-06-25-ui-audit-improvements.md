# UI Audit + Improvement Backlog — Staff CRM Dashboard

**Date:** 2026-06-25
**Method:** impeccable `critique` (product register) + make-interfaces-feel-better checklist + an independent design-review pass. Deterministic detector unavailable in this install (fallback to manual/code review).
**Verdict:** Handcrafted, domain-aware, functional — but a **stock shadcn theme** foundation plus **prototype-grade UX polish** (thin validation/loading/empty states, no number alignment). Grade ~6.5/10; the P0 set below moves it toward 8.

Sorting (a real gap) is already being addressed by Phase 3.

---

## Nielsen heuristics (0–4)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of status | 2 | No skeletons; submit just disables; no "creating…" feedback |
| 2 | Match real world | 3 | `follow_up`/`sub_source` shown raw; staff-ok but no hinting |
| 3 | User control/freedom | 3 | No undo on stage change; activity posts immediately; no unsaved-change guard |
| 4 | Error prevention | 1 | No required markers, no inline validation; zone check only after fill |
| 5 | Recognition vs recall | 2 | Filters/owner selection don't persist; no breadcrumb on some detail pages |
| 6 | Flexibility/efficiency | 3 | ⌘K good; **sorting absent (→ Phase 3)**; no bulk actions/saved views |
| 7 | Aesthetic/minimalist | 2 | Uniform `space-y-4`/`gap-4` rhythm; identical page headers; cards everywhere |
| 8 | Error diagnosis | 2 | Errors in a top-level `form.root` `<p>`; "Failed to create order" is vague |
| 9 | Help/docs | 1 | Zero inline help; no onboarding for stage/sub-source concepts |
| 10 | Error recovery | 1 | No error boundary; network failure is a silent catch |

---

## Findings (foundation + component, woven)

**Foundation (theme/CSS):**
- **F1 — Stock theme, no brand.** All neutrals `chroma 0`; `--primary` near-black; chart colors all gray. Untouched shadcn. For a food brand this is the template tell.
- **F2 — No `tabular-nums` on data.** Money, totals, invoice, stat values, counts, dates all proportional → columns misalign, numbers jitter. (`tabular-nums` exists only in a vendored sidebar badge.)
- **F3 — Dead `.gradient-text` class** in `globals.css` (unused) — violates the project's "no text effects" rule by its mere presence; remove.
- **F4 — No `text-wrap: balance/pretty`** on headings/body. `antialiased` IS applied (good).
- Decorative motion (`animate-float`/`pulse-ring`) is marketing-only (brand register) — acceptable, no change.

**Component/page:**
- **C1 — No validation feedback.** Order form + intake: no required markers, no inline errors; submit silently disables (`order-form.tsx`).
- **C2 — Disabled submit gives no reason** (`order-form.tsx`) — user can't tell which fields block.
- **C3 — No skeleton loading** anywhere despite `ui/skeleton.tsx` existing (lists, stat cards).
- **C4 — Empty states don't guide** (`ds/empty-state.tsx`) — no `action` slot (clear filters / create CTA).
- **C5 — Invisible row clickability** — table rows link but lack `cursor-pointer` + hover affordance.
- **C6 — Long order form has no grouping** — 14 fields one column; raw `<input type=checkbox>` for slots, raw `<textarea>` in places instead of shadcn `Checkbox`/`Textarea` (vocabulary inconsistency).
- **C7 — focus-visible rings missing** on `ds/filter-pill.tsx` + `ds/search-input.tsx` clear button.
- **C8 — Convert drawer** cramped on mobile; no sticky running-total footer.
- **C9 — No error boundary**; generic error copy.

**Strengths (keep/extend):** semantic icon+color status badges (no color-only signals), ⌘K global search grouped by type, live pricing preview on the order form.

---

## Prioritized backlog

### P0 — high leverage, low risk
1. **Brand color pass** — pick one brand hue; tint neutrals `chroma 0.005–0.01`; `--primary` + active/selected/focus use the hue (light + dark). Solid color only (honors "no text effects"). *(F1)*
2. **`tabular-nums` on all numeric/money/date cells** — tables, stat cards, invoice, counts. Add a `.nums` utility or apply per cell. *(F2)*
3. **Required markers + inline validation** — wire `FormField`/`FormMessage` on every order-form + intake field; `*` on required labels; error below field. *(C1, h4)*
4. **Disabled-submit reason** — hint line listing missing fields above the submit button. *(C2)*
5. **Skeleton loading** — `<Suspense>` + `ui/skeleton` for stat cards + list/table rows. *(C3, h1)*
6. **Row hover affordance** — `cursor-pointer` + trailing chevron / name underline on clickable table rows. *(C5)*
7. **EmptyState `action` slot** — pass "Clear filters" / "New …" CTAs from callers. *(C4)*

### P1 — polish
8. **Order-form grouping** — `<fieldset>`/section cards: Plan & Schedule · Meal Options · Delivery. Replace raw checkbox/textarea with shadcn `Checkbox`/`Textarea`. *(C6, h7)*
9. **Convert drawer** — widen (`sm:max-w-2xl`), sticky footer with running total. *(C8)*
10. **focus-visible rings** — filter pill + search clear button. *(C7, a11y)*
11. **`text-wrap: balance`** on headings, `pretty` on body/prose. *(F4)*
12. **Remove dead `.gradient-text`** class. *(F3)*
13. **Error boundary** (`error.tsx`) + specific error copy. *(C9, h10)*

### P2 — depth
14. **Spacing rhythm** — vary section gaps (not uniform `space-y-4`); differentiate page headers. *(h7)*
15. **Filter/sort persistence** — keep in URL (dovetails with Phase 3 searchParams). *(h5)*
16. **Inline help** — tooltips on stage/sub-source; onboarding empty states. *(h9)*
17. **Undo on stage change** / unsaved-change guard on sheets. *(h3)*

---

## Execution note

P0 is one cohesive, low-risk slice (theme + feel-better + validation/loading). Recommend running it as **Phase 4 — UI Polish** via the same ultracode flow **after Phase 3 lands** (Phase 3 edits the same table files — avoid collision). P1/P2 follow.
