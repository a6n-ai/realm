# Product Tech Decisions

A living log of cross-cutting technical decisions for Tiffin Grab. Each entry is a
durable convention that applies project-wide, not a one-off implementation note.

---

## TD-1 — Shared functionality lives in the `commons` packages

**Decision:** Reusable, cross-cutting functionality MUST live in the shared `commons`
packages rather than being duplicated inside `apps/web` (or any single app):

- **`@tiffin/commons`** — framework-agnostic utilities: pure helpers, validation
  errors (`ValidationError`), id/code generation (`generateCode`), security helpers,
  shared types. Anything with no Next.js or Drizzle dependency.
- **`@tiffin/commons-drizzle`** — Drizzle/ORM building blocks: column mixins
  (`updatableColumns`, `baseColumns`), repository base classes (`UpdatableRepository`),
  and other DB-layer primitives reused across schemas/services.
- **`@tiffin/commons-next`** — Next.js-specific shared code (framework-coupled helpers).

**Rule of thumb:** before writing a util/security/DB helper in `apps/web`, ask "would a
second app or another part of this app reuse it?" If yes, put it in the right `commons`
package and import it. Keep app code thin; keep shared logic in `commons`.

**Why:** avoids divergent copies, centralizes security-sensitive helpers, and keeps the
app focused on product logic. The dual-id system, updatable columns, and pricing
primitives already follow this; extend the same way for new shared code.

**How to apply:** new shared util → `@tiffin/commons`; new DB primitive → `@tiffin/commons-drizzle`;
new Next-coupled helper → `@tiffin/commons-next`. Only app-specific glue stays in `apps/web`.

---

## TD-2 — Per-tiffin volume-tiered pricing

**Decision:** Subscriptions are priced per tiffin, not by weekly fee. Price =
`perTiffinPrice × tiffinCount`, where `tiffinCount = (delivery-days/week + Sat? + Sun?)
× weeks × persons` (slot-agnostic — a multi-slot day is still one tiffin), and
`perTiffinPrice = basePrice × (1 + volumeTierUpliftPct/100)`. Larger orders hit lower
uplift tiers (20+ tiffins = best rate). No student/courier/loyalty discounts; promotional
discounts will arrive via a dedicated coupons slice (the pricing engine already exposes an
empty `adjustments` hook for them).

**Why:** matches the customer-facing "quantity-based" model on tiffingrab.ca and keeps
pricing transparent.

See: `docs/superpowers/specs/2026-06-21-plan-type-pricing-foundation-design.md`.

---

## TD-3 — Admin settings use typed controls, never free-text for known values

**Decision:** In admin/settings editors, an input MUST match the shape of its data. Do not
accept free-text where the set of valid values is known:

- **Enum** (single value from a fixed set) → `select` dropdown.
- **Multi-value enum or reference** (e.g. `offeredSlots`, `allowedStartDays`) → `multiselect`
  of the allowed options — not a comma-separated text field.
- **Date** → date picker (`date` input), not a typed string.
- **Reference to a pre-existing row** (FK / business key) → select populated from the existing
  rows, not a free-text id.

Free `text`/`number` inputs are only for genuinely open values (names, prices, descriptions).

**Why:** prevents invalid/typo'd values reaching the DB, makes settings self-documenting, and
keeps validation at the input instead of failing later at price/order time.

**How to apply:** the generic catalog editor (`apps/web/app/(dashboard)/dashboard/catalog/`)
drives fields from a `FieldDef` config. Extend `FieldType` with `multiselect` (with `options`)
and `date`, and use them for the relevant resources (slots, weekdays, dates). Backfill existing
CSV-as-enum fields (e.g. `offeredSlots`) to `multiselect` when touched.
