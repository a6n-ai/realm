# Catalog Settings Revamp — Design

**Date:** 2026-06-25
**Scope:** Catalog resources only (`/dashboard/catalog`). Out of scope: general / lead-assignment / lead-sources / meal-slots settings pages.
**Status:** Approved for planning.

## Problem

The catalog admin editor is stringly-typed and drift-prone:

- **Stringly-typed round-trip.** Every value goes DB row → `Record<string,string>` (`rowToFields`) → `Number()` / `split(",")` (`fieldsToPatch`) → patch. No validation on either side. `saveItem(patch: Record<string, unknown>)` writes whatever it is handed. CSV / multiselect values containing commas corrupt silently.
- **Schema ↔ config drift = silent data loss and a live crash.**
  - `pricing-tiers` has a page and a `TABLES` entry but is **missing from `SERVICES`** in `actions.ts`. Saving a pricing tier evaluates `SERVICES["pricing-tiers"].create` = `undefined.create` → runtime crash.
  - `addons` table + `addonService` exist with **no UI at all**.
  - `delivery_frequencies.courier_discount_pct` and `duration_packages.discount_pct` exist in the DB (both `notNull`) but are editable nowhere.
- **Free-text `key`.** `key` is a `.notNull().unique()` machine identifier entered as raw text — typo / collision / whitespace prone. Violates the project's typed-controls rule (TD-3).

## Decisions (locked)

| Question | Decision |
|---|---|
| Surface scope | Catalog resources only |
| Backend aggressiveness | Validation + fix drift (no DB restructure / migration) |
| `key` field | Auto-slug from name, shown read-only, editable **only on create** |
| Editor surface | Side **Sheet** + react-hook-form + zodResolver |
| `addons` | Bring into the catalog editor as a new resource |

## Architecture

**Stays:** one generic `ResourceEditor` driving all resources; commons `UpdatableRepository`; soft-delete (`active=false`) semantics; the `[resource]` dynamic route; the existing `FieldDef` render-metadata idea.

**Changes:** a **Zod schema per resource** becomes the single source of truth, imported by both the client form and the service. The service validates through it on write. The UI moves to a Sheet form using react-hook-form + zodResolver (the pattern `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx` already uses). The `rowToFields` / `fieldsToPatch` string round-trip is deleted.

### Component / unit boundaries

- **`resource-config.ts`** — per resource: `{ label, schema: ZodObject, fields: FieldDef[] }`.
  - `schema` is the authority (validation + types).
  - `fields[]` carries render metadata only (control type, label, unit, `optionsSource`, `optionLabels`) keyed to schema fields. No conversion logic lives here anymore.
  - What it does: declares each catalog resource's shape + how to render it. Depends on: zod, the dynamic-options sources. Consumers: the service layer and the editor — both import `schema`; only the editor reads `fields`.
- **`CatalogService<T>`** (new subclass in `catalog.service.ts`) — holds its resource `schema`; overrides `create` / `update` to `schema.parse` (full on create, `.partial().parse` on update) then call `super`. Per the extends-commons convention. What it does: typed, validated writes for one catalog table. Depends on: commons `UpdatableRepository`, the resource zod schema. Consumers: `actions.ts`.
- **`ResourceEditor` + `ResourceSheet`** — list view + Sheet form. What it does: render rows, open a typed Sheet to add/edit, submit through the server action. Depends on: shadcn Sheet/Form/Select/Switch, the resource `schema` + `fields`, the server actions. Consumers: `[resource]/page.tsx`.

## Backend

### Validation in the service (extends-commons convention)

```
class CatalogService<TTable> extends SoftDeleteService<TTable> {
  constructor(repo, private schema: ZodObject) { super(repo); }
  async create(patch)      { return super.create(this.schema.parse(patch)); }
  async update(id, patch)  { return super.update(id, this.schema.partial().parse(patch)); }
}
```

- Authority lives at the write, so any caller (action, seed, future API) is validated.
- The same `schema` is imported by the client form (zodResolver) for instant inline errors. No divergence possible.
- Reactivate (`update(id, { active: true })`) goes through `.partial()` — `active` must be part of the schema or allowed through; keep `active` in the schema as optional boolean.

### Drift / crash fixes

- `pricing-tiers` → add to `SERVICES` in `actions.ts` (fixes the save crash). Already in `TABLES` and `RESOURCES`.
- `addons` → new resource: add to `RESOURCES`, `TABLES`, `SERVICES`. Fields: `name`, `key` (slug), `pricePerWeek` (number, `$`).
- `delivery-frequencies` → add `courierDiscountPct` field (number, `%`).
- `duration-packages` → add `discountPct` field (number, `%`).

## Keys — auto-slug, editable on create only

- `slug(name)` helper: lowercase, spaces/punctuation → single hyphen, trim leading/trailing hyphens.
- Applies to the 4 keyed resources: `plans`, `meal-sizes`, `delivery-frequencies`, `addons`. (`delivery-zones`, `pricing-tiers`, `duration-packages` have no `key` column — identity is `name` / `weeks` / qty band.)
- Sheet behaviour: editing **Name** prefills `key` via `slug(name)`. `key` shown read-only with an "edit" toggle that unlocks the field **only when creating**. On edit of an existing row, `key` is frozen (stable identifier).
- Zod: `key` = `/^[a-z0-9-]+$/`. Uniqueness is enforced by the DB unique constraint; the service surfaces the unique-violation as a friendly field error.

## UI — Sheet editor

- **List row:** primary field (name) + secondary chip (type / tier / diet where relevant) + retired `Badge` + Edit and Retire/Reactivate buttons. `[+ Add <resource>]` opens the Sheet in create mode.
- **Sheet form:** typed controls only — `Select` for enums, multiselect chips for array fields, `Input type=number` with unit adornment (`$` / `%` / `g` / `kcal`), `Switch` for booleans, `Input type=date` for dates. Per-field `FormMessage` from zodResolver.
- **Polish (make-interfaces-feel-better):** autofocus first field on open; Save shows a pending spinner and disables; server reject → error surfaced (field-level for unique-key, toast/inline otherwise); `router.refresh()` on success; Sheet closes on success.
- No free text where an enum / number / reference belongs (TD-3).

## Testing

- **Live-DB service tests** (per the live-DB harness; never delete shared fixtures): each catalog service
  - rejects a bad enum value,
  - coerces / rejects non-numeric numbers,
  - enforces `key` slug pattern and uniqueness,
  - soft-deletes (`active=false`) and reactivates,
  - round-trips the newly surfaced columns (`courierDiscountPct`, `discountPct`).
- **Zod unit test** per resource schema: one valid case + the key invalid cases.
- **Regression test** for the `pricing-tiers` save path (the crash) and the `addons` create path (new resource).

## Out of scope (deliberate)

- No DB migrations / schema restructure (decision: validation + fix drift, not deep restructure).
- No generic form-builder abstraction beyond the existing `FieldDef`.
- No changes to general / lead-assignment / lead-sources / meal-slots pages.
